# PriceWatch CL

WebApp para monitorear precios en tiendas online usando Playwright.

## Requisitos

- Node.js
- PostgreSQL (opcional, por defecto usa SQLite para local)

## Instalación

1. **Servidor**:
   ```bash
   cd server
   npm install
   npx playwright install chromium
   npx prisma generate
   npx prisma db push
   ```

2. **Cliente**:
   ```bash
   cd client
   npm install
   ```

## Ejecución

1. **Servidor**:
   ```bash
   cd server
   npm run dev
   ```
   El servidor correrá en http://localhost:3001

2. **Cliente**:
   ```bash
   cd client
   npm run dev
   ```
   El cliente correrá en http://localhost:5173

## Uso

1. Abre http://localhost:5173
2. Crea un nuevo Watcher.
3. Ingresa la URL del producto y el selector CSS del precio.
4. Usa el botón "Probar Selector" para verificar.
5. Guarda el watcher.
6. El sistema monitoreará el precio automáticamente.

## Variables de Entorno

Crea un archivo `.env` en la carpeta `server/` con las siguientes variables:

```env
# Base de datos (Supabase Postgres)
# Copia tu cadena desde: Supabase > Project Settings > Database > Connection string
# Formato típico:
# postgresql://postgres:YOUR_PASSWORD@db.<project-ref>.supabase.co:5432/postgres
DATABASE_URL="postgresql://postgres:YOUR_SUPABASE_PASSWORD@db.jqmzttuzytscifbydidm.supabase.co:5432/postgres"

# Notificaciones (Resend) - Opcional
RESEND_API_KEY="re_123456..."

# Configuración Scraper - Opcional
PLAYWRIGHT_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
DISABLE_CONTENT_BLOCK_DETECTION="false"

# Puerto del Servidor
PORT=3001
```
