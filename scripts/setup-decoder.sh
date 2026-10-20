#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for tool in git make gcc python3; do
  if ! command -v "$tool" >/dev/null; then
    echo "Falta $tool. Instala las dependencias indicadas en README.md."
    exit 1
  fi
done
mkdir -p "$project_dir/vendor"
if [[ ! -d "$project_dir/vendor/dump1090" ]]; then
  git clone https://github.com/PlutoSDR/dump1090.git "$project_dir/vendor/dump1090"
fi
python3 "$project_dir/scripts/patch-decoder.py" "$project_dir/vendor/dump1090"
# El ensamblador de incbin de este fork antiguo puede generar referencias DWARF
# inválidas con compiladores actuales. Reconstruir sin símbolos de depuración;
# limpiar primero evita reutilizar el objeto creado con -g por el Makefile.
make -C "$project_dir/vendor/dump1090" clean
make -C "$project_dir/vendor/dump1090" CFLAGS="-O2 -g0 -Wall -Wextra"
"$project_dir/vendor/dump1090/dump1090" --help >/dev/null
echo 'Decodificador compilado. Inícialo desde la raíz del proyecto con:'
echo 'IIOD_REMOTE=ip:192.168.2.1 ./vendor/dump1090/dump1090 --net --interactive'
