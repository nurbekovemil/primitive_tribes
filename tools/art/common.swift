// Общее для генераторов картинок: рисование частей с единым контуром и светом, полосы кадров, sprites.json.
// Генераторы запускаются через tools/art/run.sh (склеивает этот файл с нужным генератором).
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

typealias F = CGFloat
func p(_ x: F, _ y: F) -> CGPoint { CGPoint(x: x, y: y) }
extension CGPoint {
  static func + (a: CGPoint, b: CGPoint) -> CGPoint { p(a.x + b.x, a.y + b.y) }
  static func - (a: CGPoint, b: CGPoint) -> CGPoint { p(a.x - b.x, a.y - b.y) }
  static func * (a: CGPoint, k: F) -> CGPoint { p(a.x * k, a.y * k) }
}
/// Направление по углу от «вниз»; плюс — вперёд (+x).
func dir(_ a: F) -> CGPoint { p(sin(a), cos(a)) }
func rot(_ q: CGPoint, _ a: F) -> CGPoint { p(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a)) }

func hex(_ v: UInt32, _ a: F = 1) -> CGColor {
  CGColor(srgbRed: F((v >> 16) & 255) / 255, green: F((v >> 8) & 255) / 255, blue: F(v & 255) / 255, alpha: a)
}
func shade(_ v: UInt32, _ k: F) -> UInt32 {
  func c(_ s: UInt32) -> UInt32 { UInt32(max(0, min(255, F((v >> s) & 255) * k))) << s }
  return c(16) | c(8) | c(0)
}

var seed: UInt64 = 1
func rnd() -> F {
  seed = seed &* 6364136223846793005 &+ 1442695040888963407
  return F((seed >> 33) % 10000) / 10000
}

func smooth(_ pts: [CGPoint]) -> CGPath {
  let path = CGMutablePath(), n = pts.count
  path.move(to: pts[0])
  for i in 0..<n {
    let p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    path.addCurve(to: p2, control1: p1 + (p2 - p0) * (1 / 6), control2: p2 - (p3 - p1) * (1 / 6))
  }
  path.closeSubpath()
  return path
}

/// Лохматый контур: на рёбрах торчат пряди.
func shaggy(_ pts: [CGPoint], amp: F, step: F, s0: UInt64) -> [CGPoint] {
  seed = s0
  var area: F = 0
  for i in pts.indices { let a = pts[i], b = pts[(i + 1) % pts.count]; area += a.x * b.y - b.x * a.y }
  let sg: F = area > 0 ? 1 : -1
  var out: [CGPoint] = []
  for i in pts.indices {
    let a = pts[i], b = pts[(i + 1) % pts.count], d = b - a
    let len = max(0.01, hypot(d.x, d.y))
    let nrm = p(d.y / len, -d.x / len) * sg
    let n = max(1, Int((len / step).rounded()))
    for k in 0..<n {
      var q = a + d * (F(k) / F(n))
      if k % 2 == 1 { q = q + nrm * (amp * (0.5 + 0.9 * rnd())) + d * ((rnd() - 0.5) * 0.3 / F(n)) }
      out.append(q)
    }
  }
  return out
}

func capsule(_ a: CGPoint, _ b: CGPoint, _ r1: F, _ r2: F) -> CGPath {
  let d = b - a, len = max(0.001, hypot(d.x, d.y)), u = d * (1 / len), n = p(-u.y, u.x)
  let base = atan2(n.y, n.x)
  var pts: [CGPoint] = []
  for k in 0...10 { let g = base - F.pi * F(k) / 10; pts.append(b + p(cos(g), sin(g)) * r2) }
  for k in 0...10 { let g = base - F.pi - F.pi * F(k) / 10; pts.append(a + p(cos(g), sin(g)) * r1) }
  let path = CGMutablePath()
  path.addLines(between: pts)
  path.closeSubpath()
  return path
}
func ellipse(_ c: CGPoint, _ rx: F, _ ry: F) -> CGPath { CGPath(ellipseIn: CGRect(x: c.x - rx, y: c.y - ry, width: rx * 2, height: ry * 2), transform: nil) }
/// Точки в локальной системе: поворот, масштаб, сдвиг.
func tr(_ pts: [CGPoint], _ o: CGPoint, _ a: F, _ s: F, flip: F = 1) -> [CGPoint] { pts.map { o + rot(p($0.x * flip, $0.y) * s, a) } }

// ---------- палитра ----------
let OUT: UInt32 = 0x23150b
let SKIN: UInt32 = 0xc4885a
let FUR: UInt32 = 0x8c6a3e
let WOOD: UInt32 = 0x77522e
let STONE: UInt32 = 0x8a867c
let FAR: F = 0.8
let OLW: F = 3.2

/// Обводка детали, лежащей поверх другой (рука на теле, бивень на шкуре): толщина и непрозрачность.
var haloW: F = 3.4, haloA: F = 0.7
/// Где рука держит ношу в последнем нарисованном кадре (для людей).
var handOut = p(0, 0)

/// rad — круглый свет (центр, радиус) вместо общего: для куполов и других круглых поверхностей.
struct Part { var paths: [CGPath]; var color: UInt32; var outline = true; var halo = false; var stroke: F = 0; var rad: (CGPoint, F)? = nil }
var parts: [Part] = []
var xf = CGAffineTransform.identity
var gradA = p(0, 0), gradB = p(0, 0)

/// Слои открытых построек: детали рисуются в слой curLayer (0 — земля, 1… — предметы); если задан want,
/// в картинку попадает только этот слой — так землю и каждый предмет можно сортировать по глубине отдельно.
var curLayer = 0
var want: Int? = nil

func add(_ ps: [CGPath], _ c: UInt32, outline: Bool = true, halo: Bool = false) {
  if let w = want, w != curLayer { return }
  parts.append(Part(paths: ps.map { $0.copy(using: &xf)! }, color: c, outline: outline, halo: halo))
}
func mark(_ pts: [CGPoint], _ c: UInt32, _ w: F) {
  if let l = want, l != curLayer { return }
  let path = CGMutablePath()
  path.addLines(between: pts)
  let k = sqrt(abs(xf.a * xf.d - xf.b * xf.c))
  parts.append(Part(paths: [path.copy(using: &xf)!], color: c, outline: false, stroke: w * k))
}

/// Слой цвета племени: рисуются только детали цвета `tintOf` — светло-серыми, с тем же светом, а всё,
/// что лежит поверх них (руки, борода, оружие), вырезается. В игре слой красят в цвет племени.
var tintOf: UInt32? = nil
let TINT_GRAY: UInt32 = 0xe2e2e2

func renderTint(_ ctx: CGContext, _ cloth: UInt32) {
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  let g = CGGradient(colorsSpace: space, colors: [hex(shade(TINT_GRAY, 1.2)), hex(TINT_GRAY), hex(shade(TINT_GRAY, 0.74))] as CFArray, locations: [0, 0.45, 1])!
  for pt in parts {
    let mine = pt.color == cloth && pt.stroke == 0
    ctx.setBlendMode(mine ? .normal : .clear)
    if pt.stroke > 0 {
      ctx.addPath(pt.paths[0]); ctx.setStrokeColor(hex(0)); ctx.setLineWidth(pt.stroke); ctx.strokePath()
      continue
    }
    if pt.halo || (pt.outline && !mine) {
      // обводка детали поверх одежды должна остаться видна
      for path in pt.paths { ctx.addPath(path); ctx.setStrokeColor(hex(0)); ctx.setLineWidth(pt.halo ? haloW : OLW * 2); ctx.strokePath() }
    }
    for path in pt.paths {
      ctx.saveGState(); ctx.addPath(path); ctx.clip()
      if mine { ctx.drawLinearGradient(g, start: gradA, end: gradB, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]) }
      else { ctx.setFillColor(hex(0)); ctx.fill(CGRect(x: -2000, y: -2000, width: 4000, height: 4000)) }
      ctx.restoreGState()
    }
  }
  ctx.setBlendMode(.normal)
}

func render(_ ctx: CGContext) {
  ctx.setLineJoin(.round)
  ctx.setLineCap(.round)
  if let cloth = tintOf { return renderTint(ctx, cloth) }
  for pt in parts where pt.outline && pt.stroke == 0 {
    for path in pt.paths {
      ctx.addPath(path); ctx.setFillColor(hex(OUT)); ctx.fillPath()
      ctx.addPath(path); ctx.setStrokeColor(hex(OUT)); ctx.setLineWidth(OLW * 2); ctx.strokePath()
    }
  }
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  for pt in parts {
    if pt.stroke > 0 {
      ctx.addPath(pt.paths[0]); ctx.setStrokeColor(hex(pt.color)); ctx.setLineWidth(pt.stroke); ctx.strokePath()
      continue
    }
    if pt.halo {
      for path in pt.paths { ctx.addPath(path); ctx.setStrokeColor(hex(OUT, haloA)); ctx.setLineWidth(haloW); ctx.strokePath() }
    }
    // свет слева сверху, тень справа и к земле — общий для всей фигуры, поэтому без швов
    let g = CGGradient(colorsSpace: space, colors: [hex(shade(pt.color, 1.2)), hex(pt.color), hex(shade(pt.color, 0.74))] as CFArray, locations: [0, 0.45, 1])!
    for path in pt.paths {
      ctx.saveGState(); ctx.addPath(path); ctx.clip()
      if let (c, r) = pt.rad {
        let gr = CGGradient(colorsSpace: space, colors: [hex(shade(pt.color, 1.28)), hex(pt.color), hex(shade(pt.color, 0.62))] as CFArray, locations: [0, 0.4, 1])!
        ctx.drawRadialGradient(gr, startCenter: c, startRadius: 0, endCenter: c, endRadius: r, options: [.drawsAfterEndLocation])
      } else {
        ctx.drawLinearGradient(g, start: gradA, end: gradB, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
      }
      ctx.restoreGState()
    }
  }
}

// ---------- вывод ----------
func strip(_ name: String, _ count: Int, _ w: Int, _ h: Int, _ ax: F, _ ay: F, _ draw: (Int) -> Void) -> [[F]] {
  let ctx = CGContext(data: nil, width: w * count, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.translateBy(x: 0, y: F(h)); ctx.scaleBy(x: 1, y: -1)
  var hands: [[F]] = []
  for i in 0..<count {
    draw(i)
    ctx.saveGState()
    ctx.clip(to: CGRect(x: F(i * w), y: 0, width: F(w), height: F(h)))
    ctx.translateBy(x: F(i * w) + ax, y: ay)
    render(ctx)
    ctx.restoreGState()
    hands.append([(handOut.x / 2 * 10).rounded() / 10, (handOut.y / 2 * 10).rounded() / 10])
  }
  let url = URL(fileURLWithPath: ASSETS + "/" + name + ".png")
  let dst = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, ctx.makeImage()!, nil)
  CGImageDestinationFinalize(dst)
  return hands
}

let ASSETS = ProcessInfo.processInfo.environment["ASSETS"] ?? "apps/client/public/assets"

/** Дописать описания картинок в sprites.json (остальные записи не трогаются). */
func saveManifest(_ entries: [String: Any]) {
  let path = ASSETS + "/sprites.json"
  var manifest = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: Any]
  for (k, v) in entries { manifest[k] = v }
  try! JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path))
}
