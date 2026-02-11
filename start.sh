#!/bin/bash
echo "========================================"
echo "   AMANET API SERVER - LINUX"
echo "========================================"

cd "$(dirname "$0")"

# Verificare Node.js
if ! command -v node &> /dev/null; then
    echo "EROARE: Node.js nu este instalat!"
    echo "Ruleaza: sudo apt-get install nodejs"
    exit 1
fi

# Verificare dependente
if [ ! -d "node_modules" ]; then
    echo "Instalare dependente..."
    npm install
fi

echo ""
echo "Pornire server pe portul 3100..."
echo "Acces: http://localhost:3100/mobile.html"
echo ""
echo "Pentru oprire: CTRL+C"
echo "========================================"
echo ""

node server-firebird.js
