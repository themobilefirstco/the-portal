"""Render the README's illustrative workflow. Development only: pip install Pillow."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math
ROOT = Path(__file__).resolve().parents[1]
FONT = Path('/System/Library/Fonts/Supplemental')
def font(size, bold=False):
    name = 'Arial Bold.ttf' if bold else 'Arial.ttf'
    if (FONT/name).exists(): return ImageFont.truetype(str(FONT/name), size)
    return ImageFont.truetype('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf', size)
BG='#0c1319'; PANEL='#17232d'; MUTE='#9cafbc'; WHITE='#f3f8fa'; GREEN='#8ee7be'
frames=[]
states=[('YOUR ROOM, READY.', 'A dashboard between conversations.', 'READY', 'No one has joined yet.'),
        ('SOMEONE JOINS.', 'Google Meet detects a visitor. The Portal joins.', 'CONNECTING', 'An arrival chime welcomes your guest.'),
        ('YOU ARE TOGETHER.', 'Your room becomes part of the conversation.', 'IN A MEETING', 'Camera and microphone on.'),
        ('BACK TO YOUR ROOM.', 'Visitors leave. The Portal returns to the dashboard.', 'READY', 'Ready for the next conversation.')]
for i in range(64):
    phase=i//16; local=i%16; title,sub,status,detail=states[phase]
    im=Image.new('RGB',(1000,560),BG);d=ImageDraw.Draw(im)
    d.text((48,30),'THE PORTAL',font=font(20,True),fill=GREEN)
    d.text((775,34),'OPEN SOURCE / macOS',font=font(12),fill=MUTE)
    d.text((48,82),title,font=font(35,True),fill=WHITE)
    d.text((48,130),sub,font=font(18),fill=MUTE)
    d.rounded_rectangle((48,180,646,453),radius=20,fill=PANEL,outline='#2b3d4b',width=2)
    d.rounded_rectangle((70,200,624,420),radius=12,fill='#0b141a')
    if phase==2:
        for x,y,c in [(86,218,'#34584f'),(350,218,'#324a68')]:
            d.rounded_rectangle((x,y,x+248,y+157),radius=12,fill=c)
            d.ellipse((x+103,y+27,x+145,y+69),fill='#d7e8e2')
            d.rounded_rectangle((x+78,y+77,x+170,y+141),radius=35,fill='#d7e8e2')
        d.text((272,390),'Google Meet',font=font(15),fill=WHITE)
    else:
        d.text((96,227),'Hello, room.',font=font(30,True),fill=WHITE)
        for j,w in enumerate([210,360,290]):
            d.rounded_rectangle((96,285+j*30,96+w,298+j*30),radius=6,fill='#233844')
        if phase==1:
            r=15+int(7*math.sin(local/15*math.pi))
            d.ellipse((557-r,249-r,557+r,249+r),outline=GREEN,width=3)
    d.line((347,453,347,472),fill='#546b79',width=7)
    d.rounded_rectangle((298,471,396,478),radius=3,fill='#546b79')
    d.rounded_rectangle((680,202,952,410),radius=18,fill=PANEL)
    d.ellipse((702,228,712,238),fill=GREEN)
    d.text((724,224),status,font=font(15,True),fill=GREEN)
    # Wrap into short lines for reliable rendering on a small README.
    import textwrap
    for j,line in enumerate(textwrap.wrap(detail,25)):
        d.text((702,270+j*25),line,font=font(17),fill=WHITE)
    d.text((702,367),'Google Meet + Google account',font=font(12),fill=MUTE)
    for j in range(4):
        x=48+j*230
        d.rounded_rectangle((x,500,x+212,504),radius=2,fill=GREEN if j<=phase else '#25343e')
    d.text((48,524),'Illustrated workflow, not a live recording. Join behavior depends on setup and Meet access.',font=font(12),fill=MUTE)
    frames.append(im.quantize(colors=64))
out=ROOT/'docs/assets/portal-workflow.gif'
frames[0].save(out,save_all=True,append_images=frames[1:],duration=125,loop=0,optimize=True,disposal=2)
print(f'{out.name}: {out.stat().st_size:,} bytes')
