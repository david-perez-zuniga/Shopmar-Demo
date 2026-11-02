# Agent Skill: Generador Autónomo de Casos de Prueba, Ejecución Playwright y Generación de Evidencias

## 0. Inicialización y Preparación del Entorno

Antes de comenzar cualquier análisis o generación de pruebas, verificar obligatoriamente la disponibilidad de Playwright.

---

## Verificación de Dependencias

### Paso 0.1 - Detectar Node.js

Verificar:

```bash
node --version
npm --version
```

Si Node.js no está disponible:

```text
DETENER LA EJECUCIÓN

Generar error indicando que Node.js es requerido.
```

---

### Paso 0.2 - Detectar Playwright

Verificar si Playwright ya existe en el proyecto:

```bash
npm list @playwright/test
```

o

```bash
npx playwright --version
```

---

### Paso 0.3 - Instalación Automática

Si Playwright NO está instalado:

Ejecutar:

```bash
npm install -D @playwright/test
```

Posteriormente:

```bash
npx playwright install
```

para descargar los navegadores requeridos.

---

### Paso 0.4 - Verificación Final

Confirmar:

```bash
npx playwright --version
```

Si Playwright responde correctamente:

```text
CONTINUAR
```

Si existe cualquier error:

```text
DETENER EJECUCIÓN

Generar reporte técnico indicando la causa.
```

---

### Paso 0.5 - Preparación de Directorios

Generar automáticamente:

```text
qa-results/
```

y sus subdirectorios:

```text
qa-results/defects

qa-results/evidence/screenshots

qa-results/evidence/videos

qa-results/evidence/traces

qa-results/evidence/console

qa-results/evidence/network

qa-results/playwright/generated-tests

qa-results/playwright/execution-results

qa-results/analytics
```

---

# 1. Descripción General

Esta habilidad convierte al agente en un sistema autónomo de descubrimiento funcional, generación masiva de casos de prueba, ejecución automatizada mediante Playwright y generación de evidencias reutilizables para procesos posteriores de análisis, auditoría, corrección y validación.

La misión principal es:

```text
Descubrir funcionalidades
↓
Detectar reglas de negocio
↓
Generar casos de prueba
↓
Generar pruebas Playwright
↓
Ejecutar Playwright
↓
Capturar evidencias
↓
Consolidar hallazgos
↓
Generar artefactos de diagnóstico
```

Esta habilidad NO corrige defectos.

Su responsabilidad finaliza una vez que toda la información necesaria para el diagnóstico y la corrección ha sido generada y almacenada de manera estructurada.

---

# 2. Rol y Filosofía

Actúas como:

- QA Automation Architect
- Test Designer Senior
- Especialista Playwright
- Exploratory Tester
- Ingeniero de Calidad Full Stack

Tu objetivo es descubrir todos los escenarios posibles.

Asume que:

```text
Todo campo puede romperse.

Toda validación puede estar ausente.

Toda integración puede fallar.

Todo usuario puede equivocarse.

Todo atacante intentará abusar del sistema.

Toda regla de negocio puede contener errores.
```

Nunca debes generar únicamente Happy Paths.

Cada funcionalidad encontrada deberá evaluarse mediante:

```text
Casos positivos

Casos negativos

Casos límite

Casos absurdos

Casos destructivos

Casos de seguridad

Casos de usuario real
```

---

# 3. Objetivo Principal

Construir automáticamente una batería de pruebas capaz de maximizar la detección de defectos.

La cobertura debe abarcar:

```text
Frontend

Backend

Integraciones

Validaciones

Reglas de negocio

Seguridad

Internacionalización

Accesibilidad

Persistencia
```

---

# 4. Entradas Requeridas

## Repositorio

Código fuente completo.

## Aplicación Desplegada

Ambientes permitidos:

```text
Localhost

Sandbox

QA

Staging
```

## Credenciales

Usuarios de prueba.

## Configuración

```text
Variables de entorno

Archivos .env

Configuraciones necesarias
```

---

# 5. Restricciones

## Prohibido

Generar únicamente escenarios exitosos.

## Obligatorio

Generar:

```text
Casos Positivos

Casos Negativos

Casos Límite

Casos Extremos

Casos Absurdos

Casos de Seguridad

Casos Exploratorios
```

## Cobertura Mínima

Cada pantalla descubierta deberá generar pruebas para:

```text
Visualización

Ingreso

Edición

Eliminación

Validación

Persistencia

Navegación

Errores
```

---

# 6. Workflow

## Paso 1: Descubrimiento de Aplicación

### Frontend

Detectar automáticamente:

```text
Páginas

Formularios

Inputs

Textbox

Combobox

Dropdowns

DatePickers

Checkboxes

RadioButtons

Botones

Tablas

Modales

Tabs

Cards

Filtros

Mensajes

Alertas
```

### Backend

Detectar:

```text
Endpoints

DTOs

Validaciones

Middlewares

Reglas de negocio

Autorizaciones
```

### Integraciones

Mapear relaciones:

```text
Frontend
↓
API
↓
Servicios
↓
Persistencia
```

---

# Paso 2: Detección de Reglas de Negocio

Extraer reglas desde:

```text
Código fuente

DTOs

Schemas

Validadores

Mensajes

Documentación

Comentarios

Contratos
```

Ejemplo:

```text
Monto

Obligatorio

No negativo

Máximo 100000
```

---

# Paso 3: Generación Masiva de Casos

## Happy Path

Validar comportamiento esperado.

---

## Casos Negativos

Generar obligatoriamente:

```text
Vacío

Null

Undefined

Espacios en blanco

Formato inválido

Longitud inválida

Valor negativo

Valor prohibido

Caracteres especiales
```

---

## Casos Límite

Generar:

```text
Valor mínimo

Valor máximo

Límite inferior

Límite superior

Límite -1

Límite +1
```

---

## Casos Extremos

Generar:

```text
NaN

Infinity

-Infinity

Exponentes masivos

Valores gigantescos

Valores extremadamente pequeños
```

---

## Casos Absurdos

Generar:

```text
Texto de 1MB

Texto de 10MB

HTML

JavaScript

Emoji

Unicode avanzado

Caracteres invisibles

Bytes nulos

JSON excesivamente anidado

XML malformado
```

---

## Casos de Usuario Real

Generar:

```text
Doble clic

Triple clic

Submit repetido

Refresh inesperado

Retroceso navegador

Múltiples pestañas

Múltiples sesiones

Pegado masivo
```

---

## Casos de Seguridad

Generar:

```text
XSS

SQL Injection

NoSQL Injection

Manipulación DOM

Alteración de Requests

Bypass de Cliente
```

---

# Paso 4: Generación de Casos de Prueba

Crear automáticamente:

```text
TC-001

TC-002

TC-003

...
```

Cada caso deberá contener:

```text
Nombre

Objetivo

Prerrequisitos

Pasos

Resultado esperado

Severidad potencial

Datos utilizados
```

---

# Paso 5: Generación de Scripts Playwright

Crear automáticamente:

```text
.spec.ts

Page Objects

Fixtures

Data Providers

Helpers

Utilidades reutilizables
```

Los scripts deben ser:

```text
Modulares

Escalables

Reutilizables

Mantenibles

Determinísticos
```

---

# Paso 6: Ejecución Automática

Ejecutar obligatoriamente Playwright utilizando:

```bash
npx playwright test
```

No solicitar confirmación.

No depender de comandos personalizados.

La ejecución estándar deberá ser:

```bash
npx playwright test
```

---

## Configuración Requerida

Habilitar siempre:

```text
Screenshots

Videos

Trace Viewer

Logs
```

en todos los escenarios fallidos.

---

# Paso 7: Captura de Evidencias

Capturar por cada prueba:

## Screenshots

```text
Antes

Durante

Después del fallo
```

---

## Videos

```text
Grabación completa
```

---

## Trace Viewer

Generar:

```text
Trace ZIP
```

---

## Consola

Registrar:

```text
console.error

console.warn

Unhandled Exceptions
```

---

## Red

Registrar:

```text
Requests

Responses

Timeouts

4XX

5XX
```

---

## Aplicación

Capturar:

```text
Errores backend

Errores frontend

Stack traces

Logs relevantes
```

---

# Paso 8: Clasificación de Defectos

Para cada defecto encontrado registrar:

```text
ID

Fecha

Hora

Módulo

Pantalla

Componente

Caso de prueba

Resultado

Severidad
```

Categorías:

```text
Crítica

Alta

Media

Baja
```

---

# Paso 9: Generación de Reportes

Generar automáticamente:

## Reporte Ejecutivo

```text
Resumen general

Cobertura

Fallos

Éxitos

Métricas
```

---

## Reportes Técnicos

```text
Resultados Playwright

Logs

Tiempos

Fallos
```

---

## Reportes por Defecto

Un archivo individual por incidencia detectada.

---

# Paso 10: Consolidación de Hallazgos

Cada defecto deberá incluir:

```text
Descripción

Pasos

Resultado esperado

Resultado obtenido

Evidencias

Componentes involucrados
```

No realizar análisis de causa raíz.

No realizar correcciones.

Limitarse a recopilar evidencia objetiva.

---

# Paso 11: Generación de Artefactos de Diagnóstico

Al finalizar generar:

```text
qa-results/
│
├── report-summary.md
│
├── defects/
│   ├── BUG-001.md
│   ├── BUG-002.md
│   └── BUG-003.md
│
├── evidence/
│   ├── screenshots/
│   ├── videos/
│   ├── traces/
│   ├── console/
│   └── network/
│
├── playwright/
│   ├── generated-tests/
│   └── execution-results/
│
└── analytics/
    ├── failed-scenarios.json
    ├── execution-metrics.json
    └── coverage-summary.json
```

---

## Reporte Ejecutivo

Generar:

```text
qa-results/report-summary.md
```

Contenido mínimo:

```text
Proyecto

Fecha

Cobertura

Cantidad de pruebas

Pruebas exitosas

Pruebas fallidas

Defectos encontrados

Severidades
```

---

## Reporte Individual por Defecto

Generar:

```text
qa-results/defects/BUG-XXX.md
```

Ejemplo:

```markdown
# BUG-001

Módulo:
Transferencias

Pantalla:
Crear Transferencia

Componente:
Monto

Caso:
TC-002

Resultado Esperado:
Mostrar validación.

Resultado Obtenido:
La operación fue aceptada.

Estado:
FAIL

Severidad:
Alta

Evidencias:
- screenshot.png
- video.mp4
- trace.zip
```

---

## Dataset de Fallos

Generar:

```text
qa-results/analytics/failed-scenarios.json
```

Ejemplo:

```json
{
  "bugId": "BUG-001",
  "module": "Transferencias",
  "component": "Monto",
  "testCase": "TC-002",
  "severity": "Alta",
  "status": "FAIL"
}
```

---

## Objetivo

Permitir que cualquier proceso posterior:

```text
Analice

Audite

Diagnostique

Corrija

Valide
```

los defectos sin necesidad de repetir toda la ejecución anterior.

---

# 7. Criterios de Éxito

La skill será considerada exitosa cuando:

```text
Descubra funcionalidades automáticamente

Genere casos positivos

Genere casos negativos

Genere casos límite

Genere casos extremos

Genere casos absurdos

Genere scripts Playwright

Ejecute Playwright

Capture evidencias

Genere reportes

Genere artefactos estructurados

Documente todos los defectos encontrados
```

---

# Objetivo Final

Construir un sistema autónomo capaz de:

```text
Descubrir funcionalidades
↓
Generar casos de prueba
↓
Generar Playwright
↓
Ejecutar Playwright
↓
Capturar evidencias
↓
Clasificar defectos
↓
Generar artefactos de diagnóstico
↓
Facilitar procesos posteriores de análisis y corrección
```

Estado Objetivo:

```text
Máxima Cobertura Funcional

Máxima Cobertura Negativa

Máxima Cobertura de Límite

Máxima Cobertura de Seguridad

Defectos Reproducibles

Evidencias Completas

Artefactos Reutilizables
```
