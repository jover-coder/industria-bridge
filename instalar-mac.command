#!/bin/bash

# IndustrIA Bridge - Instalador para Mac
# Este script descarga e instala la aplicación automáticamente

clear
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║           🟧 IndustrIA Bridge - Instalador Mac             ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Paso 1/4:${NC} Descargando IndustrIA Bridge..."
echo ""

TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

curl -L -o IndustrIA-Bridge-mac.zip "https://github.com/jover-coder/industria-bridge/releases/latest/download/IndustrIA-Bridge-mac.zip" --progress-bar

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Error al descargar. Verifica tu conexión a internet."
    read -p "Presiona Enter para cerrar..."
    exit 1
fi

echo ""
echo -e "${YELLOW}Paso 2/4:${NC} Descomprimiendo..."
unzip -q IndustrIA-Bridge-mac.zip

echo -e "${YELLOW}Paso 3/4:${NC} Instalando en Aplicaciones..."

if [ -d "/Applications/IndustrIA Bridge.app" ]; then
    rm -rf "/Applications/IndustrIA Bridge.app"
fi

mv "IndustrIA Bridge.app" "/Applications/"

echo -e "${YELLOW}Paso 4/4:${NC} Configurando permisos de seguridad..."
xattr -cr "/Applications/IndustrIA Bridge.app"

rm -rf "$TEMP_DIR"

echo ""
echo -e "${GREEN}✅ ¡Instalación completada!${NC}"
echo ""
echo "La aplicación está en: /Applications/IndustrIA Bridge.app"
echo ""

read -p "¿Abrir IndustrIA Bridge ahora? (s/n): " respuesta
if [ "$respuesta" = "s" ] || [ "$respuesta" = "S" ]; then
    open "/Applications/IndustrIA Bridge.app"
fi

echo ""
echo "Puedes cerrar esta ventana."
