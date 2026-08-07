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
    sw, sh = 350, 350 * H // W
    small = im.resize((sw, sh))
    px = list(small.get_flattened_data())

    def locate(pred, label):
        pts = [(i % sw, i // sw) for i, p in enumerate(px) if pred(p)]
        if not pts:
            print('  %-14s none' % label)
            return None
        xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
        # bounding box
        bbox = (min(xs), min(ys), max(xs), max(ys))
        # count blobs: coarse 14x14 grid occupancy
        gx, gy = 14, 14
        grid = [[0] * gx for _ in range(gy)]
        for x, y in pts:
            grid[min(y * gy // sh, gy - 1)][min(x * gx // sw, gx - 1)] = 1
        blobs = sum(sum(row) for row in grid)
        print('  %-14s %4d px  bbox(x%%:%.0f-%.0f, y%%:%.0f-%.0f)  grid-cells=%d'
              % (label, len(pts), 100.0 * bbox[0] / sw, 100.0 * bbox[1] / sh,
                 100.0 * bbox[2] / sw, 100.0 * bbox[3] / sh, blobs))
        return bbox

    # TRUE accent red: strongly saturated
    locate(lambda p: p[0] > 130 and p[0] - p[1] > 55 and p[0] - p[2] > 55, 'SAT-RED')
    # deep ink
    locate(lambda p: p[0] < 65 and p[1] < 65 and p[2] < 65, 'INK<65')
    # medium ink / dark text
    locate(lambda p: p[0] < 110 and p[1] < 100 and p[2] < 95, 'DARKBROWN')
    # bright red-orange (vermilion)
    locate(lambda p: p[0] > 150 and p[1] < 110 and p[2] < 80 and p[0] - p[1] > 60, 'VERMILION')
    # bright gold/yellow
    locate(lambda p: p[0] > 170 and p[1] > 140 and p[2] < 110, 'GOLD/YELLOW')

    # vertical profile of bottom 14% (timeline area) - avg color per 2% row slice
    print('-- bottom 14%% vertical profile --')
    bpx = list(im.resize((200, 200 * H // W)).get_flattened_data())
    bw = 200
    bh = len(bpx) // bw
    for k in range(7):
        r0 = int((1.0 - 0.14) * bh) + k * 2 * bh // 100
        r1 = r0 + 2 * bh // 100
        rowpx = bpx[r0 * bw:r1 * bw]
        avgc = tuple(sum(p[i] for p in rowpx) // len(rowpx) for i in range(3))
        dark = sum(1 for p in rowpx if p[0] < 80 and p[1] < 80 and p[2] < 80)
        redd = sum(1 for p in rowpx if p[0] > 120 and p[0] - p[1] > 50 and p[0] - p[2] > 50)
        print('  y=%d%%: avg=%s dark=%.1f%% red=%.1f%%'
              % (86 + k * 2, hexc(avgc), 100.0 * dark / len(rowpx), 100.0 * redd / len(rowpx)))

    # top 12% vertical profile (top bar)
    print('-- top 12%% vertical profile --')
    for k in range(6):
        r0 = k * 2 * bh // 100
        r1 = r0 + 2 * bh // 100
        rowpx = bpx[r0 * bw:r1 * bw]
        avgc = tuple(sum(p[i] for p in rowpx) // len(rowpx) for i in range(3))
        dark = sum(1 for p in rowpx if p[0] < 80 and p[1] < 80 and p[2] < 80)
        redd = sum(1 for p in rowpx if p[0] > 120 and p[0] - p[1] > 50 and p[0] - p[2] > 50)
        print('  y=%d%%: avg=%s dark=%.1f%% red=%.1f%%'
              % (k * 2, hexc(avgc), 100.0 * dark / len(rowpx), 100.0 * redd / len(rowpx)))

    # saturated color histogram: hue family counts (for fill vs line detection)
    satpx = [p for p in px if max(p) - min(p) > 30]
    fam = Counter()
    for p in satpx:
        r, g, b = p
        if r > g and r > b:
            fam['red-ish'] += 1
        elif g > r and g > b:
            fam['green-ish'] += 1
        elif b > r and b > g:
            fam['blue-ish'] += 1
        elif abs(r - g) < 25 and abs(g - b) < 25:
            fam['gray-ish'] += 1
    tot = sum(fam.values())
    print('-- hue families among saturated pixels (total %d) --' % tot)
    for k, v in fam.most_common():
        print('  %-10s %6.2f%%' % (k, 100.0 * v / tot))

analyze(sys.argv[1])
