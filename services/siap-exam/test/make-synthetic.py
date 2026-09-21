"""Generate a disposable, non-student card for the opt-in vision smoke test."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
out = Path(__file__).parent / 'synthetic-card.jpg'
im = Image.new('RGB', (1000, 1400), 'white')
d = ImageDraw.Draw(im)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 28)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 23)
d.text((55, 40), 'AVALIACAO FICTICIA - TESTE DE SOFTWARE', font=font, fill='black')
d.text((55, 95), 'Estudante: ALUNO FICTICIO TESTE', font=font, fill='black')
d.text((55, 145), 'CIENCIAS DA NATUREZA - ENSINO FUNDAMENTAL', font=small, fill='black')
d.text((55, 190), '15 questoes - alternativas A, B, C, D', font=small, fill='black')
d.text((250, 250), 'Estudante', font=font, fill='black')
d.text((650, 250), 'Professor', font=font, fill='black')
marks = 'DCDD CACCCD BAADB'.replace(' ', '')
for i, answer in enumerate(marks):
    y = 330 + i * 60
    d.rectangle((150, y-30, 850, y+30), outline='black', width=2)
    d.text((170, y-17), str(i+1).zfill(2), font=font, fill='black')
    for j, letter in enumerate('ABCD'):
        x = 300 + j * 85
        d.ellipse((x-22, y-22, x+22, y+22), fill='black' if letter==answer else 'white', outline='black', width=2)
        if letter != answer: d.text((x-10,y-16), letter, font=font, fill='black')
    d.line((610,y-30,610,y+30),fill='black',width=2)
d.text((55, 1300), 'DOCUMENTO SINTETICO - NENHUM DADO DE ALUNO REAL',font=small,fill='black')
im.save(out, quality=92)
print('Cartao ficticio gerado; 15 questoes.')
