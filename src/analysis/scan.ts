import ts from 'typescript'
import type { EagerVia, EdgeKind, RawEdge, RefPosition } from '../@types'

export interface ScanContext {
    checker?: ts.TypeChecker
    preserveImports?: boolean
}

function isTopLevel(node: ts.Node): boolean {
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
        if (p.kind === ts.SyntaxKind.SourceFile) return true
        if (ts.isFunctionLike(p) || ts.isClassStaticBlockDeclaration(p)) return false
    }
    return false
}

function hasStaticModifier(node: ts.Node): boolean {
    return !!(ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword))
}

export function isEager(position: RefPosition): boolean {
    return position.startsWith('eager')
}

const VIA_RANK: Record<EagerVia, number> = {
    heritage: 5,
    decorator: 4,
    'star-reexport': 3,
    static: 2,
    'side-effect': 1,
    'module-body': 0,
}

export function strongerVia(a: EagerVia | undefined, b: EagerVia): EagerVia {
    if (!a) return b
    return VIA_RANK[a] >= VIA_RANK[b] ? a : b
}

const VIA_BY_POSITION: Partial<Record<RefPosition, EagerVia>> = {
    'eager-heritage': 'heritage',
    'eager-decorator': 'decorator',
    'eager-static': 'static',
    eager: 'module-body',
}

export function classifyReference(id: ts.Identifier): RefPosition {
    const direct = id.parent
    if (!direct) return 'eager'

    if (ts.isPropertyAccessExpression(direct) && direct.name === id) return 'type'
    if (ts.isQualifiedName(direct) && direct.right === id) return 'type'
    if (ts.isPropertyAssignment(direct) && direct.name === id) return 'type'
    if (ts.isPropertySignature(direct) && direct.name === id) return 'type'
    if (ts.isMethodDeclaration(direct) && direct.name === id) return 'type'
    if (ts.isBindingElement(direct) && direct.propertyName === id) return 'type'

    for (let p: ts.Node | undefined = direct; p; p = p.parent) {
        switch (p.kind) {
            case ts.SyntaxKind.Decorator:
                return 'eager-decorator'

            case ts.SyntaxKind.ExpressionWithTypeArguments: {
                const hc = p.parent
                if (hc && ts.isHeritageClause(hc) &&
                    hc.token === ts.SyntaxKind.ExtendsKeyword &&
                    hc.parent &&
                    (ts.isClassDeclaration(hc.parent) || ts.isClassExpression(hc.parent))) {
                    return 'eager-heritage'
                }
                return 'type'
            }

            case ts.SyntaxKind.ImportDeclaration:
            case ts.SyntaxKind.ImportClause:
            case ts.SyntaxKind.ImportSpecifier:
            case ts.SyntaxKind.NamespaceImport:
            case ts.SyntaxKind.ExportDeclaration:
            case ts.SyntaxKind.ExportSpecifier:
                return 'type'

            case ts.SyntaxKind.PropertyDeclaration:
                return hasStaticModifier(p) ? 'eager-static' : 'deferred'

            case ts.SyntaxKind.ClassStaticBlockDeclaration:
                return 'eager-static'

            case ts.SyntaxKind.SourceFile:
                return 'eager'
        }

        if (ts.isTypeNode(p)) return 'type'
        if (ts.isFunctionLike(p)) return 'deferred'
    }

    return 'eager'
}

const KIND_RANK: Record<EdgeKind, number> = {
    'value-static': 4,
    'side-effect': 3,
    require: 2,
    dynamic: 1,
    'type-only': 0,
}

export function strongerKind(a: EdgeKind, b: EdgeKind): EdgeKind {
    return KIND_RANK[a] >= KIND_RANK[b] ? a : b
}

export function scanFile(sf: ts.SourceFile, ctx: ScanContext = {}): RawEdge[] {
    const edges: RawEdge[] = []
    const bindingOwners = new Map<string, number[]>()

    const lineOf = (node: ts.Node): number => {
        try {
            return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
        } catch {
            return 0
        }
    }

    const own = (name: string, index: number): void => {
        const list = bindingOwners.get(name)
        if (list) list.push(index)
        else bindingOwners.set(name, [index])
    }

    const isTypeOnlySymbol = (name: ts.Identifier): boolean => {
        const checker = ctx.checker
        if (!checker || ctx.preserveImports) return false
        try {
            let sym = checker.getSymbolAtLocation(name)
            if (!sym) return false
            if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym)
            const f = sym.getFlags()
            return !!(f & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) &&
                !(f & ts.SymbolFlags.Value)
        } catch {
            return false
        }
    }

    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node)) {
            const spec = node.moduleSpecifier
            if (ts.isStringLiteral(spec)) {
                const clause = node.importClause

                if (!clause) {
                    // `import './x'` — evaluated purely for its side effects.
                    edges.push({
                        specifier: spec.text,
                        kind: 'side-effect',
                        eager: true,
                        eagerVia: 'side-effect',
                        bindings: [],
                        line: lineOf(node),
                    })
                } else {
                    const names: string[] = []
                    const typeFlags: boolean[] = []

                    if (clause.name) {
                        names.push(clause.name.text)
                        typeFlags.push(clause.isTypeOnly || isTypeOnlySymbol(clause.name))
                    }
                    const nb = clause.namedBindings
                    if (nb && ts.isNamespaceImport(nb)) {
                        names.push(nb.name.text)
                        typeFlags.push(clause.isTypeOnly)
                    } else if (nb) {
                        for (const el of nb.elements) {
                            names.push(el.name.text)
                            typeFlags.push(clause.isTypeOnly || el.isTypeOnly || isTypeOnlySymbol(el.name))
                        }
                    }

                    const allTypeOnly = typeFlags.length > 0 && typeFlags.every(Boolean)
                    const index = edges.length
                    edges.push({
                        specifier: spec.text,
                        kind: allTypeOnly ? 'type-only' : 'value-static',
                        eager: false,
                        bindings: names,
                        line: lineOf(node),
                    })
                    if (!allTypeOnly) {
                        for (let i = 0; i < names.length; i++) {
                            if (!typeFlags[i]) own(names[i], index)
                        }
                    }
                }
            }
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            const spec = node.moduleSpecifier
            if (ts.isStringLiteral(spec)) {
                const nb = node.exportClause
                let typeOnly = node.isTypeOnly
                const names: string[] = []

                if (nb && ts.isNamedExports(nb)) {
                    let all = nb.elements.length > 0
                    for (const el of nb.elements) {
                        names.push(el.name.text)
                        if (!el.isTypeOnly) all = false
                    }
                    if (all) typeOnly = true
                }

                edges.push({
                    specifier: spec.text,
                    kind: typeOnly ? 'type-only' : 'value-static',
                    eager: !typeOnly && !nb,
                    eagerVia: !typeOnly && !nb ? 'star-reexport' : undefined,
                    bindings: names,
                    line: lineOf(node),
                })
            }
        } else if (ts.isCallExpression(node)) {
            const arg = node.arguments[0]
            const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
            const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'

            if ((isDynamicImport || isRequire) && arg && ts.isStringLiteralLike(arg)) {
                const topLevel = isRequire && isTopLevel(node)
                const kind: EdgeKind = isDynamicImport ? 'dynamic' : topLevel ? 'require' : 'dynamic'
                edges.push({
                    specifier: arg.text,
                    kind,
                    eager: kind === 'require',
                    eagerVia: kind === 'require' ? 'module-body' : undefined,
                    bindings: [],
                    line: lineOf(node),
                })
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(sf)

    if (bindingOwners.size === 0) return edges

    const markRefs = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) {
            const owners = bindingOwners.get(node.text)
            if (owners) {
                const position = classifyReference(node)
                if (isEager(position)) {
                    const via = VIA_BY_POSITION[position] ?? 'module-body'
                    for (const i of owners) {
                        edges[i].eager = true
                        edges[i].eagerVia = strongerVia(edges[i].eagerVia, via)
                        if (!edges[i].eagerLine) edges[i].eagerLine = lineOf(node)
                    }
                }
            }
        }
        ts.forEachChild(node, markRefs)
    }
    markRefs(sf)

    return edges
}
