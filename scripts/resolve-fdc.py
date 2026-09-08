#!/usr/bin/env python3
"""Resolve food targets -> best SR Legacy fdc_id by keyword match.
Usage: python3 resolve-fdc.py targets.tsv   (cols: key<TAB>must_have,words<TAB>exclude,words)
Prints: key  fdc_id  description   (shortest description containing all must-have, none of excludes)
"""
import csv, sys, re

foods = list(csv.DictReader(open('usda-src/food.csv', newline='')))

def best(must, excl):
    must = [m.strip().lower() for m in must.split(',') if m.strip()]
    excl = [e.strip().lower() for e in excl.split(',') if e.strip()]
    cands = []
    for r in foods:
        d = r['description'].lower()
        if all(m in d for m in must) and not any(e in d for e in excl):
            cands.append((len(r['description']), r['fdc_id'], r['description']))
    cands.sort()
    return cands[0] if cands else (None, None, None)

for line in open(sys.argv[1]):
    line = line.rstrip('\n')
    if not line or line.startswith('#'):
        continue
    parts = line.split('\t')
    key = parts[0]
    must = parts[1] if len(parts) > 1 else key
    excl = parts[2] if len(parts) > 2 else ''
    _, fid, desc = best(must, excl)
    print(f"{key}\t{fid}\t{desc}")
