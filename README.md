# IndustrIA Bridge - App Puente para CNC

Aplicación de escritorio que conecta IndustrIA con las tronzadoras del taller. Descarga automáticamente los archivos de corte y los deposita en las carpetas configuradas para cada máquina.

## Descargar

**Descarga directa (sin compilar):** [GitHub Releases](https://github.com/industria-app/bridge/releases/latest)

- **Windows**: `IndustrIA-Bridge-Portable.exe` - Doble clic y listo
- **macOS**: `IndustrIA-Bridge.zip` - Descomprimir y abrir
- **Linux**: `IndustrIA-Bridge.AppImage` - Doble clic y listo

## Características

- **Multi-plataforma**: Windows, macOS y Linux
- **Sin instalación**: Ejecutables portables, solo descarga y ejecuta
- **Sincronización automática**: Busca nuevos trabajos cada 5 segundos
- **Multi-máquina**: Configura diferentes carpetas para cada tronzadora
- **Bandeja del sistema**: Se minimiza a la bandeja para funcionar en segundo plano
- **Inicio automático**: Opción de iniciar con el sistema operativo
- **Logs locales**: Registro completo de actividad para diagnóstico

## Compilar desde código fuente

### Requisitos previos

- Node.js 18+ instalado

### Desarrollo

```bash
cd bridge-app
npm install
npm start
```

### Compilar para distribución

```bash
# Windows (genera EXE portable)
npm run build:win

# macOS (genera ZIP con .app)
npm run build:mac

# Linux (genera AppImage)
npm run build:linux

# Todos los sistemas
npm run build:all
```

Los ejecutables se generarán en la carpeta `dist/`.

## Uso

1. **Iniciar sesión**: Usa las mismas credenciales que en IndustrIA web
2. **Sincronizar máquinas**: Las máquinas configuradas en IndustrIA aparecerán automáticamente
3. **Configurar carpetas**: Asigna una carpeta de destino para cada máquina
4. **Listo**: La app buscará trabajos pendientes y depositará los archivos automáticamente

## Flujo de trabajo

```
IndustrIA Web                    App Puente                      Tronzadora
     │                               │                               │
     │  1. Usuario genera            │                               │
     │     hoja de corte             │                               │
     │                               │                               │
     │  2. Archivo se guarda         │                               │
     │     con estado "pendiente"    │                               │
     │                               │                               │
     │ ◄─── 3. Polling cada 5s ─────►│                               │
     │                               │                               │
     │  4. Envía archivo y           │                               │
     │     metadatos                 │                               │
     │                               │                               │
     │                               │  5. Guarda archivo            │
     │                               │     en carpeta local ────────►│
     │                               │                               │
     │ ◄─── 6. Confirma entrega ─────│                               │
     │                               │                               │
     │  7. Marca como "enviado"      │                               │
     └───────────────────────────────┴───────────────────────────────┘
```

## Endpoints API utilizados

La app se comunica con IndustrIA mediante estos endpoints:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/auth/login` | POST | Autenticación con email/password |
| `/api/cnc/puente/trabajos` | GET | Lista de trabajos pendientes |
| `/api/cnc/puente/maquinas` | GET | Configuración de máquinas |
| `/api/cnc/puente/completar/:id` | POST | Marcar trabajo como entregado |

## Estructura de archivos

```
bridge-app/
├── package.json          # Configuración del proyecto
├── src/
│   ├── main.js          # Proceso principal de Electron
│   ├── index.html       # Interfaz de usuario
│   └── renderer.js      # Lógica del frontend
├── assets/
│   ├── icon.png         # Icono de la aplicación
│   ├── icon.ico         # Icono para Windows
│   └── icon.icns        # Icono para macOS
└── dist/                # Instaladores generados
```

## Configuración avanzada

La configuración se guarda en:

- **Windows**: `%APPDATA%/industria-bridge/config.json`
- **macOS**: `~/Library/Application Support/industria-bridge/config.json`
- **Linux**: `~/.config/industria-bridge/config.json`

Opciones configurables:

```json
{
  "serverUrl": "https://industria.app",
  "pollingInterval": 5000,
  "autoStart": true,
  "minimizeToTray": true
}
```

## Solución de problemas

### La app no encuentra trabajos

1. Verifica que has iniciado sesión correctamente
2. Asegúrate de que hay máquinas configuradas en IndustrIA web
3. Comprueba que has generado alguna hoja de corte en estado "pendiente"

### Los archivos no llegan a la carpeta

1. Verifica que la carpeta existe y tienes permisos de escritura
2. Revisa los logs en la app (sección "Actividad Reciente")
3. Comprueba los logs completos en la carpeta de usuario

### Error de conexión

1. Verifica la URL del servidor
2. Comprueba tu conexión a internet
3. Asegúrate de que el servidor IndustrIA está funcionando

## Licencia

Propiedad de IndustrIA. Todos los derechos reservados.
