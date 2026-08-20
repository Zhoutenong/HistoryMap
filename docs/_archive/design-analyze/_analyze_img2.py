# -*- coding: utf-8 -*-
import sys
from PIL import Image
from collections import Counter

def hexc(c):
    return '#%02x%02x%02x' % (c[0], c[1], c[2])

def analyze(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    name = path.replace('\\', '/').split('/')[-1]
    print('=== %s | %dx%d ===' % (name, W, H))

    # band variance, correct indexing
    small2 = im.resize((120, H * 120 // W))
    pix = list(small2.get_flattened_data())
    sw = 120
    sh = len(pix) // sw
    print('-- horizontal band variance (structure, %d rows) --' % sh)
    for band in range(10):
        r0 = band * sh // 10
        r1 = (band + 1) * sh // 10
        band_px = pix[r0 * sw:r1 * sw]
        if not band_px:
            continue
        rs = [p[0] for p in band_px]
        gs = [p[1] for p in band_px]
        bs = [p[2] for p in band_px]
        var = (max(rs) - min(rs) + max(gs) - min(gs) + max(bs) - min(bs)) / 3
        print('  band %d (%d-%d%% height): range %.0f' % (band, band * 10, band * 10 + 10, var))

    # red / ink clusters: find pixels of specific hue families, cluster by quantize
    px = list(im.resize((700, 700 * H // W)).get_flattened_data())
    reds = [p for p in px if p[0] > 90 and p[0] > p[1] * 1.5 and p[0] > p[2] * 1.5]
    inks = [p for p in px if p[0] < 90 and p[1] < 90 and p[2] < 90]
    warm = [p for p in px if p[0] > 110 and 60 <= p[1] <= 130 and 40 <= p[2] <= 110]
    def cluster(plist, label):
        if not plist:
            print('  %s: none' % label)
            return
        q = Counter(plist)
        print('  %s: %d px (%.2f%% of sampled)' % (label, len(plist), 100.0 * len(plist) / len(px)))
        for col, n in q.most_common(5):
            print('      %s  %6.2f%%' % (hexc(col), 100.0 * n / len(px)))
    cluster(reds, 'RED family (accent)')
    cluster(inks, 'INK near-black')
    cluster(warm, 'WARM brown/terracotta')

    # specific UI zones: sample key regions precisely
    def zone(x0, y0, x1, y1, label):
        r = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))).resize((40, 40))
        rp = list(r.get_flattened_data())
        avgc = tuple(sum(p[i] for p in rp) // len(rp) for i in range(3))
        dark = sum(1 for p in rp if p[0] < 80 and p[1] < 80 and p[2] < 80)
        redcnt = sum(1 for p in rp if p[0] > 90 and p[0] > p[1] * 1.5 and p[0] > p[2] * 1.5)
        print('  zone %-28s avg=%s  dark%%=%.1f  red%%=%.1f' % (label, hexc(avgc),
              100.0 * dark / len(rp), 100.0 * redcnt / len(rp)))

    print('-- UI zone probes --')
    zone(0.00, 0.00, 0.20, 0.09, 'top-left (logo?)')
    zone(0.80, 0.00, 1.00, 0.09, 'top-right (controls?)')
    zone(0.00, 0.90, 1.00, 1.00, 'bottom strip (timeline?)')
    zone(0.00, 0.82, 0.35, 1.00, 'bottom-left')
    zone(0.65, 0.82, 1.00, 1.00, 'bottom-right')
    zone(0.80, 0.15, 0.98, 0.45, 'right-middle (panel?)')
    zone(0.00, 0.10, 0.15, 0.40, 'left-middle (panel?)')
    zone(0.30, 0.45, 0.60, 0.70, 'center (map body)')

analyze(sys.argv[1])
