#!/usr/bin/env python3
"""Compatibilidad del fork antiguo de PlutoSDR con GCC en Linux."""
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]) / 'dump1090.c'
text = source.read_text()
original = 'INCBIN(html,"gmap.html");'
patched = original + '\n/* Airplains: incbin must restore the executable section on Linux. */\n__asm__(".text");'
if patched not in text:
    if text.count(original) != 1:
        sys.exit('No se reconoce la versión de dump1090: revisa la llamada INCBIN antes de compilar.')
    text = text.replace(original, patched, 1)
# Los tiempos CPR son long long; abs() puede truncar su diferencia.
text = re.sub(r'\b(?:ll)*abs\(a->even_cprtime - a->odd_cprtime\)', 'llabs(a->even_cprtime - a->odd_cprtime)', text)
if text != source.read_text():
    source.write_text(text)
