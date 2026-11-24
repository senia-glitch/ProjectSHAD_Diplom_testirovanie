"""Markdown-описания: лимит на сервере и безопасность клиентского рендера (через node, если установлен)."""
import json
import shutil
import subprocess
from pathlib import Path
import pytest
from app.scenarios.tasks import TaskError, validate_task

ROOT = Path(__file__).resolve().parents[2]


def task(prompt):
    return {'kind': 'open', 'variant': 'long', 'prompt': prompt, 'data': {}}


def test_long_markdown_prompt_allowed_and_limited():
    text = '# Заголовок\n\n![](https://example.com/a.png)\n' + 'текст ' * 2500
    assert validate_task(task(text))['prompt'] == text.strip()
    with pytest.raises(TaskError):
        validate_task(task('x' * 20001))


CASES = {
    'bold': ('**жирный** и *курсив*', ['<strong>жирный</strong>', '<em>курсив</em>']),
    'link': ('[сайт](https://example.com/a_b_c)', ['href="https://example.com/a_b_c"', 'target="_blank"', 'rel="noopener noreferrer nofollow"']),
    'image': ('![схема](https://example.com/s_1.png)', ['<img class="md-media" src="https://example.com/s_1.png" alt="схема"']),
    'youtube_after_text': ('См. видео:\nhttps://youtu.be/dQw4w9WgXcQ', ['<p>См. видео:</p>', 'youtube-nocookie.com/embed/dQw4w9WgXcQ']),
    'youtube': ('https://www.youtube.com/watch?v=dQw4w9WgXcQ', ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'sandbox=']),
    'video': ('https://example.com/clip.mp4', ['<video class="md-media" controls']),
    'audio': ('https://example.com/a.mp3', ['<audio class="md-audio" controls']),
    'list': ('- раз\n- два', ['<ul><li>раз</li><li>два</li></ul>']),
    'table': ('| a | b |\n|---|---|\n| 1 | 2 |', ['<th>a</th>', '<td>2</td>']),
}
FORBIDDEN = {
    'script': '<script>alert(1)</script>',
    'img_onerror': '<img src=x onerror=alert(1)>',
    'js_link': '[x](javascript:alert(1))',
    'js_image': '![x](javascript:alert(1))',
    'quote_break': '![x](https://e.com/a.png"onerror="alert(1))',
    'data_link': '[x](data:text/html;base64,PHNjcmlwdD4=)',
}


@pytest.mark.skipif(not shutil.which('node'), reason='node не установлен')
def test_markdown_renderer_output_and_safety():
    script = (ROOT / 'frontend' / 'markdown.js').read_text(encoding='utf-8')
    inputs = {k: v[0] for k, v in CASES.items()} | FORBIDDEN
    program = script + f'\nconst inputs = {json.dumps(inputs, ensure_ascii=False)};\n' \
        'const out = {}; for (const [k, v] of Object.entries(inputs)) out[k] = renderMarkdown(v);\n' \
        'out.__plain = markdownPlain("### Тема\\nПроверочная по **планеты**. Материал: [статья](https://x.org/a_b)\\n![фото](https://x.org/m.jpg)\\nhttps://youtu.be/abcdefghijk");\n' \
        'process.stdout.write(JSON.stringify(out));'
    result = subprocess.run(['node', '-e', program], capture_output=True, text=True, encoding='utf-8', check=True)
    out = json.loads(result.stdout)
    assert out.pop('__plain') == 'Тема Проверочная по планеты. Материал: статья фото'
    for key, (_, expected) in CASES.items():
        for fragment in expected:
            assert fragment in out[key], (key, out[key])
    for key in FORBIDDEN:
        html = out[key].lower()
        assert not any(bad in html for bad in ('<script', '<img src=x', 'href="javascript', 'src="javascript', 'href="data', '" onerror', '"onerror')), (key, out[key])
