import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'

// --- Shared helpers ---

function expandSimpleGlob(root: string, pattern: string): string[] {
  const parts = pattern.split('/')
  // Handle "packages/*" or "apps/*"
  if (parts.length === 2 && parts[1] === '*') {
    const dir = path.join(root, parts[0])
    if (!fs.existsSync(dir)) return []
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(dir, e.name))
    } catch { return [] }
  }
  const resolved = path.join(root, pattern)
  return fs.existsSync(resolved) ? [resolved] : []
}

// --- npm/yarn/pnpm workspace detector ---

function findNpmManifests(root: string): string[] | null {
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  let pkg: { workspaces?: string[] | { packages?: string[] } }
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as typeof pkg }
  catch { return null }

  const ws = pkg.workspaces
  if (!ws) return null
  const globs = Array.isArray(ws) ? ws : (ws.packages ?? [])
  const dirs: string[] = []
  for (const g of globs) dirs.push(...expandSimpleGlob(root, g))
  const manifests = dirs.map(d => path.join(d, 'package.json')).filter(p => fs.existsSync(p))
  return manifests.length > 0 ? manifests : null
}

function parseNpmDeps(manifest: string): Map<string, string> {
  const deps = new Map<string, string>()
  try {
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    for (const group of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      if (!group) continue
      for (const [name, ver] of Object.entries(group)) {
        if (!deps.has(name)) deps.set(name, ver)
      }
    }
  } catch { /* ignore */ }
  return deps
}

// --- Cargo workspace detector ---

function findCargoManifests(root: string): string[] | null {
  const cargoPath = path.join(root, 'Cargo.toml')
  if (!fs.existsSync(cargoPath)) return null
  const content = fs.readFileSync(cargoPath, 'utf-8')
  if (!content.includes('[workspace]')) return null

  const m = content.match(/\[workspace\][\s\S]*?members\s*=\s*\[([^\]]+)\]/)
  if (!m) return null

  const manifests: string[] = []
  for (const raw of m[1].split(',')) {
    const member = raw.trim().replace(/^["']|["']$/g, '')
    if (!member) continue
    const dirs = expandSimpleGlob(root, member)
    const dirList = dirs.length > 0 ? dirs : [path.join(root, member)]
    for (const d of dirList) {
      const manifest = path.join(d, 'Cargo.toml')
      if (fs.existsSync(manifest)) manifests.push(manifest)
    }
  }
  return manifests.length > 0 ? manifests : null
}

function parseCargoDeps(manifest: string): Map<string, string> {
  const deps = new Map<string, string>()
  try {
    const lines = fs.readFileSync(manifest, 'utf-8').split('\n')
    let inDeps = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (/^\[(?:dev-)?dependencies\]/.test(trimmed)) { inDeps = true; continue }
      if (/^\[/.test(trimmed) && inDeps) { inDeps = false; continue }
      if (!inDeps) continue
      const depMatch = trimmed.match(/^([\w-]+)\s*=\s*(.+)/)
      if (!depMatch) continue
      const [, name, rest] = depMatch
      const viaInline = rest.trim().match(/^["']([^"']+)["']/)
      const viaKey = rest.match(/version\s*=\s*["']([^"']+)["']/)
      const ver = viaInline ? viaInline[1] : viaKey ? viaKey[1] : null
      if (ver) deps.set(name, ver)
    }
  } catch { /* ignore */ }
  return deps
}

// --- Go workspace detector ---

function findGoManifests(root: string): string[] | null {
  const goWork = path.join(root, 'go.work')
  if (!fs.existsSync(goWork)) return null
  const content = fs.readFileSync(goWork, 'utf-8')
  const manifests: string[] = []
  for (const m of content.matchAll(/^use\s+\.\/([\w./-]+)/gm)) {
    const goMod = path.join(root, m[1], 'go.mod')
    if (fs.existsSync(goMod)) manifests.push(goMod)
  }
  return manifests.length > 0 ? manifests : null
}

function parseGoModDeps(manifest: string): Map<string, string> {
  const deps = new Map<string, string>()
  try {
    const content = fs.readFileSync(manifest, 'utf-8')
    for (const m of content.matchAll(/^\s+([\w./\-]+)\s+(v[\d.]+[\w.-]*)/gm)) {
      deps.set(m[1], m[2])
    }
  } catch { /* ignore */ }
  return deps
}

interface MonoDetector {
  name: string
  findManifests(root: string): string[] | null
  parseDeps(manifest: string): Map<string, string>
}

const MONO_DETECTORS: MonoDetector[] = [
  { name: 'npm', findManifests: findNpmManifests, parseDeps: parseNpmDeps },
  { name: 'cargo', findManifests: findCargoManifests, parseDeps: parseCargoDeps },
  { name: 'go', findManifests: findGoManifests, parseDeps: parseGoModDeps },
]

export const caMono001: Rule = {
  id: 'CA-MONO001',
  description: 'The same dependency is declared at different versions across monorepo workspace packages.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const detector of MONO_DETECTORS) {
      const manifests = detector.findManifests(ctx.repoRoot)
      if (!manifests || manifests.length < 2) continue

      // depName → Map<versionSpec, relPath[]>
      const depVersions = new Map<string, Map<string, string[]>>()
      for (const manifest of manifests) {
        const relPath = path.relative(ctx.repoRoot, manifest)
        for (const [dep, ver] of detector.parseDeps(manifest)) {
          if (!depVersions.has(dep)) depVersions.set(dep, new Map())
          const vMap = depVersions.get(dep)!
          if (!vMap.has(ver)) vMap.set(ver, [])
          vMap.get(ver)!.push(relPath)
        }
      }

      for (const [dep, vMap] of depVersions) {
        if (vMap.size <= 1) continue
        const summary = [...vMap.entries()].map(([v, pkgs]) => `${v} in ${pkgs.join(', ')}`).join(' | ')
        for (const [ver, pkgs] of vMap) {
          for (const relPath of pkgs) {
            findings.push({
              ruleId: 'CA-MONO001',
              severity: 'warn',
              file: relPath,
              message: `"${dep}" is at "${ver}" here but differs across packages: ${summary}.`,
              fix: `Align all workspace packages to use the same version of "${dep}".`,
            })
          }
        }
      }
    }

    return findings
  },
}
