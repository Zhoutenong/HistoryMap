# -*- coding: utf-8 -*-
import sys
from PIL import Image
from collections import Counter

def hexc(c):
    return '#%02x%02x%02x' % (c[0], c[1], c[2])

def analyze(path, downsample=160):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    print('=== %s | %dx%d ===' % (path.replace('\\', '/').split('/')[-1], W, H))

    # 1. Overall average brightness
    small = im.resize((downsample, int(downsample * H / W)))
    px = list(small.getdata())
    avg = tuple(sum(p[i] for p in px) // len(px) for i in range(3))
    lum = 0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2]
    print('overall avg color:', hexc(avg), 'luminance %.1f' % lum)

    # 2. Dominant colors via quantization
    q = small.quantize(colors=12, method=Image.FASTOCTREE)
    qim = q.convert('RGB')
    cnt = Counter(qim.getdata())
    total = sum(cnt.values())
    print('-- top 12 dominant colors --')
    for col, n in cnt.most_common(12):
        print('  %s  %6.2f%%' % (hexc(col), 100.0 * n / total))

    # 3. Region sampling: grid 4 cols x 6 rows, avg color per cell
    cols, rows = 4, 6
    cw, ch = W // cols, H // rows
    print('-- region grid (cols x rows avg colors) --')
    for r in range(rows):
        line = []
        for c in range(cols):
            box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            region = im.crop(box).resize((32, 32))
            rp = list(region.getdata())
            avgc = tuple(sum(p[i] for p in rp) // len(rp) for i in range(3))
            line.append(hexc(avgc))
        print('  row%d: %s' % (r, ' '.join(line)))

    # 4. Horizontal band variance (structure)
    small2 = im.resize((120, 60))
    pix = list(small2.getdata())
    print('-- horizontal band variance (structure) --')
    for band in range(10):
        band_px = pix[band * 12 * 120:(band + 1) * 12 * 120]
        rs = [p[0] for p in band_px]
        gs = [p[1] for p in band_px]
        bs = [p[2] for p in band_px]
        var = (max(rs) - min(rs) + max(gs) - min(gs) + max(bs) - min(bs)) / 3
        print('  band %d (%d%% height): range %.0f' % (band, band * 10, var))

analyze(sys.argv[1])
