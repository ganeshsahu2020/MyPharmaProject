Write-Host "Cleaning Tailwind & Vite cache..."

# Remove Vite cache
if (Test-Path ".\node_modules\.vite") {
    Remove-Item -Recurse -Force ".\node_modules\.vite"
    Write-Host "Vite cache cleared"
}

# Remove Tailwind/PostCSS cache
if (Test-Path ".\node_modules\.cache") {
    Remove-Item -Recurse -Force ".\node_modules\.cache"
    Write-Host "Tailwind/PostCSS cache cleared"
}

# Remove dist build folder
if (Test-Path ".\dist") {
    Remove-Item -Recurse -Force ".\dist"
    Write-Host "Old build removed"
}

# ✅ Check and regenerate Tailwind config if missing
if (!(Test-Path ".\tailwind.config.js")) {
    Write-Host "tailwind.config.js not found. Regenerating..."
    npx tailwindcss init -p
    Write-Host "tailwind.config.js created with PostCSS config"
}

# ✅ Check and regenerate postcss.config.js if missing
if (!(Test-Path ".\postcss.config.js")) {
    Write-Host "postcss.config.js not found. Creating..."
    @"
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
"@ | Out-File -Encoding UTF8 ".\postcss.config.js"
    Write-Host "postcss.config.js created"
}

# ✅ Reinstall dependencies
Write-Host "Installing dependencies..."
npm install

# ✅ Start Vite
Write-Host "Starting Vite Dev Server..."
npm run dev
