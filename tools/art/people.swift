// Генератор спрайтов людей (мужчина, воин с копьём или топором, женщина, мальчик, девочка; сбоку, спереди, сзади).
// Запуск из корня репозитория: tools/art/run.sh people
// Пишет apps/client/public/assets/person/*.png и обновляет их описание в sprites.json.
// *-color — только одежда светло-серым, в игре её красят в цвет племени.
// Печатает, где руки держат ношу (CARRY_AT в views.ts, единицы мира) — сверить после правок поз.
// Посмотреть кадры крупно: swiftc -O tools/art/preview.swift -o /tmp/preview && /tmp/preview out.png 1.6 файл.png:x:ширина ...
// ---------- кто ----------
struct Look {
  var scale: F = 1, hs: F = 0.8, beard = true, dress = false, hairLen: F = 1, spear = false, hair: UInt32 = 0x3b2414, crown = false
  /// Боевой топор вместо копья (держится и носится там же, где копьё).
  var bigAxe = false
  /// Коренастость: 1 — широкие плечи, мощный торс, толстые руки и короткие толстые ноги; 0 — обычное сложение.
  var bulk: F = 1
  var armed: Bool { spear || bigAxe }
}

/// Наконечник копья и топор.
func spear(_ grip: CGPoint, _ ang: F) {
  let d = dir(ang), back = grip - d * 44, tip = grip + d * 66
  add([capsule(back, tip, 2.4, 2.2)], WOOD)
  let n = p(-d.y, d.x)
  add([smooth([tip - d * 2 + n * 5.5, tip + d * 16, tip - d * 2 - n * 5.5, tip - d * 5])], STONE)
  mark([tip - d * 4 + n * 3, tip - d * 7 - n * 3], shade(WOOD, 0.6), 2.2)
}
func axe(_ grip: CGPoint, _ ang: F) {
  let d = dir(ang), n = p(-d.y, d.x), end = grip + d * 22
  add([capsule(grip - d * 6, end + d * 3, 2.4, 2.4)], WOOD)
  add([smooth([end - n * 3 - d * 1, end + n * 13 - d * 6, end + n * 15 + d * 3, end + n * 10 + d * 8, end - n * 3 + d * 5])], STONE)
}

/// Боевой топор: длинное топорище, крупное каменное лезвие, примотанное ремнём. grip — хват, ang — куда смотрит топорище.
func bigAxe(_ grip: CGPoint, _ ang: F) {
  let d = dir(ang), n = p(-d.y, d.x), end = grip + d * 46
  add([capsule(grip - d * 12, end + d * 4, 2.8, 2.8)], WOOD)
  add([smooth([end - n * 4 - d * 2, end + n * 14 - d * 10, end + n * 22 - d * 4, end + n * 22 + d * 8, end + n * 14 + d * 12, end - n * 4 + d * 6])], STONE)
  mark([end - n * 2 - d * 3, end - n * 2 + d * 5], shade(WOOD, 0.6), 2.6)
}

/// Корона вождя и его жены: кожаный ремешок с торчащими костями, спереди — черепок.
let BONE: UInt32 = 0xe2d4b0
func crown(_ band: [CGPoint], _ center: CGPoint, _ k: F, skull: CGPoint?) {
  for i in 0..<(band.count - 1) { add([capsule(band[i], band[i + 1], 2.8 * k, 2.8 * k)], 0x9c7246) }
  for (i, b) in band.enumerated() where i % 2 == 0 || band.count < 5 {
    let d0 = b - center, d = d0 * (1 / hypot(d0.x, d0.y)), n = p(-d.y, d.x), tip = b + d * 9 * k
    add([capsule(b, tip, 2.1 * k, 2.1 * k), ellipse(tip + n * 2 * k, 2.6 * k, 2.6 * k), ellipse(tip - n * 2 * k, 2.6 * k, 2.6 * k)], BONE)
  }
  if let s = skull {
    add([ellipse(s, 6 * k, 5.5 * k), ellipse(s + p(0, 5) * k, 3.8 * k, 3 * k)], BONE)
    for x in [F(-2.4), 2.4] { add([ellipse(s + p(x, -0.5) * k, 1.5 * k, 1.7 * k)], 0x2a1a0e, outline: false) }
  }
}

// ---------- сбоку ----------
struct SP {
  var lean: F = 0.26, tilt: F = -0.12
  var nl: (t: F, k: F) = (0.08, 0.22), fl: (t: F, k: F) = (-0.1, 0.22)
  var nfr: F = 0, ffr: F = 0
  var na: (a: F, e: F) = (0.12, 0.35), fa: (a: F, e: F) = (-0.08, 0.3)
  var spear = 1  // 0 нет, 1 в руке, 2 за спиной
  var spearAng: F = 2.0
  /** Хват ближе к заднему концу древка (для броска). */
  var spearShift: F = 0
  var axe: F? = nil
  /// Мясо на кости в ближней руке (едят на кухне).
  var food = false
}

func side(_ L: Look, _ P: SP) {
  parts = []
  let B = L.bulk
  let LT: F = 19 - 3 * B, LS: F = 16 - 2.5 * B
  func leg(_ hip: CGPoint, _ t: F, _ k: F) -> (CGPoint, CGPoint) { let kn = hip + dir(t) * LT; return (kn, kn + dir(t - k) * LS) }
  // ноги и руки толще, кисти и ступни крупнее
  let lr = (8.5 + 2.5 * B, 7 + 2 * B), ar = (6.5 + 2.5 * B, 5.5 + 2 * B), hr = 6.8 + 1.8 * B
  let nh = p(3, 0), fh = p(-3, 0)
  let (nk, na) = leg(nh, P.nl.t, P.nl.k), (fk, fa) = leg(fh, P.fl.t, P.fl.k)
  let gy = max(na.y, fa.y) + 9
  xf = CGAffineTransform(scaleX: L.scale, y: L.scale).translatedBy(x: 0, y: -gy)

  let up = p(sin(P.lean), -cos(P.lean)), fw = p(cos(P.lean), sin(P.lean))
  func tl(_ f: F, _ u: F) -> CGPoint { fw * f + up * u }
  let footPts = [p(-8, -3), p(-9, 4), p(-5, 9), p(10, 9), p(21, 8), p(25, 4), p(21, -1), p(11, -3), p(2, -7)].map { p($0.x * (1 + 0.12 * B), $0.y) }

  if L.bigAxe && P.spear == 2 { bigAxe(tl(14, 4), atan2(tl(-24, 92).x - tl(14, 4).x, tl(-24, 92).y - tl(14, 4).y) - 0.15) }
  if L.spear && P.spear == 2 { add([capsule(tl(20, -8), tl(-24, 92), 2.4, 2.2)], WOOD); }
  if L.spear && P.spear == 2 {
    let d = tl(-24, 92) - tl(20, -8), u = d * (1 / hypot(d.x, d.y)), n = p(-u.y, u.x), tip = tl(-24, 92)
    add([smooth([tip + n * 5.5, tip + u * 16, tip - n * 5.5, tip - u * 4])], STONE)
  }
  // дальняя нога и рука
  let farSkin = shade(SKIN, FAR)
  add([capsule(fh, fk, lr.0, lr.1), capsule(fk, fa, lr.1, lr.1 - 1), smooth(tr(footPts, fa, P.ffr, 1))], farSkin)
  let fs = tl(-1, 33), fe = fs + dir(P.fa.a) * 20, fwr = fe + dir(P.fa.a + P.fa.e) * 19
  add([capsule(fs, fe, ar.0, ar.1), capsule(fe, fwr, ar.1, ar.1 - 0.5), ellipse(fwr + dir(P.fa.a + P.fa.e) * 3, hr - 0.3, hr - 0.3)], farSkin)
  // туловище — сутулое, с животом; у коренастых грудь и загривок шире
  let torso: [(F, F)] = [(-13, -2), (-15, 10), (-16, 22), (-14, 31), (-7, 39), (4, 41), (11, 36), (15, 27), (18, 14), (17, 3), (12, -4), (0, -6)]
  add([smooth(torso.map { tl($0.0 * (1 + 0.4 * B * max(0, min(1, ($0.1 - 6) / 26))), $0.1) })], SKIN)
  // ближняя нога
  add([capsule(nh, nk, lr.0, lr.1), capsule(nk, na, lr.1, lr.1 - 1), smooth(tr(footPts, na, P.nfr, 1))], SKIN)
  // повязка или платье с рваным краем
  func hem(_ a: (F, F), _ b: (F, F), _ teeth: Int, _ depth: F) -> [CGPoint] {
    var r: [CGPoint] = []
    for i in 0...teeth * 2 {
      let t = F(i) / F(teeth * 2)
      let f = a.0 + (b.0 - a.0) * t, u = a.1 + (b.1 - a.1) * t - (i % 2 == 1 ? depth : 0)
      r.append(tl(f, u))
    }
    return r
  }
  if L.dress {
    let top: [(F, F)] = [(-15, 31), (-6, 37), (6, 36), (14 * (1 + 0.3 * B), 27), (19 * (1 + 0.15 * B), 13), (19, -2)]
    var pts = top.map { tl($0.0, $0.1) }
    pts += hem((21, -15), (-18, -17), 4, 6)
    pts += [tl(-17, -2), tl(-17, 15)]
    add([smooth(pts)], FUR)
  } else {
    let w = 1 + 0.12 * B
    var pts = [tl(-16 * w, 9), tl(0, 11), tl(18 * w, 8), tl(19 * w, -1)]
    pts += hem((18 * w, -8), (-16 * w, -10), 3, 7)
    add([smooth(pts)], FUR)
  }
  // голова: грубая, выдвинутая вперёд
  // маленькая голова сидит низко, между плечами
  let hs = L.hs, H = tl(6 + 3 * B, 38 - 3 * B) + p(7, -13) * hs, ta = P.tilt
  let face = [p(-15, -2), p(-12, -13), p(-2, -18), p(9, -15), p(15, -8), p(17, -3), p(15, 1), p(16, 7), p(14, 11), p(11, 16), p(3, 18), p(-6, 16), p(-13, 9)]
  add([smooth(tr(face, H, ta, hs))], SKIN)
  add([ellipse(H + rot(p(18, 3) * hs, ta), 5.5 * hs, 5 * hs)], shade(SKIN, 0.97))
  if L.beard {
    let b = [p(-3, -1), p(4, 2), p(11, 3), p(14, 8), p(18, 12), p(16, 19), p(10, 25), p(2, 28), p(-5, 23), p(-9, 13), p(-8, 4)]
    add([smooth(shaggy(tr(b, H, ta, hs), amp: 3.2 * hs, step: 3.2 * hs, s0: 7))], L.hair)
  }
  let hl = L.hairLen
  let hair = [p(13, -12), p(9, -19), p(-2, -23), p(-13, -19), p(-20, -8), p(-21, 6), p(-20, 6 + 20 * hl), p(-16, 8 + 20 * hl), p(-9, 6 + 16 * hl), p(-6, 12), p(-4, 4), p(0, -5), p(6, -9)]
  add([smooth(shaggy(tr(hair, H, ta, hs), amp: 4 * hs, step: 3.6 * hs, s0: 3))], L.hair)
  if L.crown {
    crown(tr([p(-19, -9), p(-14, -16), p(-6, -20), p(3, -20), p(10, -17), p(15, -12)], H, ta, hs), H + rot(p(-1, 2) * hs, ta), hs, skull: nil)
  }
  // лицо: густая сросшаяся бровь, маленький глаз, ноздря
  mark(tr([p(4, -6), p(11, -8), p(17, -5)], H, ta, hs), L.hair, 4.2 * hs)
  add([ellipse(H + rot(p(11, -1.5) * hs, ta), 1.9 * hs, 2.1 * hs)], 0x1a0e06, outline: false)
  if L.beard { mark(tr([p(13, 13), p(17, 12.5)], H, ta, hs), 0x1e1009, 2) } else {
    mark(tr([p(12, 12), p(15, 12)], H, ta, hs), shade(SKIN, 0.55), 1.8)
  }
  // оружие и ближняя рука поверх
  let ns = tl(3, 32), ne = ns + dir(P.na.a) * 20, nw = ne + dir(P.na.a + P.na.e) * 19
  let hand = nw + dir(P.na.a + P.na.e) * 3
  if L.spear && P.spear == 1 { spear(hand + dir(P.spearAng) * P.spearShift, P.spearAng) }
  if L.bigAxe && P.spear == 1 { bigAxe(hand, P.spearAng) }
  if let ax = P.axe { axe(hand, ax) }
  if P.food {
    // кость торчит из кулака вниз, кусок жареного мяса — над кулаком
    add([capsule(hand + p(-1, 2), hand + p(-3, 11), 2.4, 2.4), ellipse(hand + p(-4, 12), 3, 2.6), ellipse(hand + p(-1.5, 13), 3, 2.6)], BONE)
    add([smooth([hand + p(-8, -3), hand + p(-7, -12), hand + p(0, -17), hand + p(7, -13), hand + p(8, -4), hand + p(2, 1)])], 0x8a3a24)
    add([ellipse(hand + p(-2, -11), 3.5, 2.2)], 0xb85a3a, outline: false)
  }
  add([capsule(ns, ne, ar.0 + 0.5, ar.1 + 0.5), capsule(ne, nw, ar.1 + 0.5, ar.1), ellipse(hand, hr, hr)], SKIN, halo: true)
  handOut = hand.applying(xf)
}

func sidePoses(_ L: Look) -> [SP] {
  var r: [SP] = [SP()]
  func walk(_ i: Int) -> SP {
    let f = 2 * F.pi * F(i) / 6, s = sin(f), c = cos(f)
    var P = SP()
    // широкий косолапый шаг на полусогнутых, руки болтаются, корпус качается
    P.nl = (0.5 * s, 0.25 + 0.8 * max(0, c)); P.fl = (-0.5 * s, 0.25 + 0.8 * max(0, -c))
    P.nfr = -0.25 * max(0, c); P.ffr = -0.25 * max(0, -c)
    P.na = (-0.6 * s, 0.4); P.fa = (0.6 * s, 0.4)
    P.lean = 0.3 + 0.06 * cos(2 * f); P.tilt = -0.16 + 0.06 * sin(2 * f)
    if L.spear { P.na = (0.3 - 0.12 * s, 0.95); P.spearAng = 2.0 + 0.06 * s }
    // топор несёт на плече: топорище вверх и назад
    if L.bigAxe { P.na = (0.5 - 0.1 * s, 1.6); P.spearAng = 3.5 + 0.05 * s }
    return P
  }
  for i in 0..<6 { r.append(walk(i)) }
  // удар: замах и выпад
  var a1 = SP(), a2 = SP()
  a1.nl = (0.35, 0.3); a1.fl = (-0.4, 0.3); a2.nl = (0.5, 0.4); a2.fl = (-0.45, 0.2)
  a1.lean = 0.12; a2.lean = 0.45
  if L.spear {
    // бросок: корпус откинут назад, рука с копьём отведена за голову, другая целится; потом выпад — рука пустая
    a1.lean = 0.0; a1.tilt = -0.3; a1.nl = (0.5, 0.25); a1.fl = (-0.5, 0.35)
    a1.na = (4.4, -0.45); a1.fa = (1.55, 0.15); a1.spearAng = 1.9; a1.spearShift = 30
    a2.lean = 0.6; a2.tilt = 0.0; a2.nl = (0.6, 0.45); a2.fl = (-0.6, 0.2)
    a2.na = (1.45, 0.15); a2.fa = (-0.7, 0.5); a2.spear = 0
  }
  else if L.bigAxe {
    // замах из-за головы и рубящий удар вперёд-вниз
    a1.lean = 0.1; a1.tilt = -0.25; a1.na = (3.45, 0.55); a1.fa = (3.3, 0.55); a1.spearAng = 3.45 + 0.55 + 0.4
    a2.lean = 0.5; a2.tilt = 0.05; a2.na = (1.15, 0.35); a2.fa = (1.0, 0.35); a2.spearAng = 1.15 + 0.35 + 0.8
  }
  else { a1.na = (-0.7, 1.7); a2.na = (1.5, 0.05); a1.fa = (0.5, 0.9); a2.fa = (-0.5, 0.6) }
  r += [a1, a2]
  // рубка: топор над головой и удар
  var c1 = SP(), c2 = SP()
  c1.lean = 0.1; c1.tilt = -0.25; c1.na = (3.45, 0.55); c1.fa = (3.3, 0.55); c1.axe = 3.45 + 0.55 + 0.5
  c2.lean = 0.5; c2.tilt = 0.05; c2.na = (1.15, 0.35); c2.fa = (1.0, 0.35); c2.axe = 1.15 + 0.35 + 0.9
  c1.nl = (0.3, 0.3); c1.fl = (-0.3, 0.3); c2.nl = (0.35, 0.45); c2.fl = (-0.3, 0.3)
  c1.spear = 2; c2.spear = 2
  r += [c1, c2]
  // сбор: на корточках
  var k1 = SP(), k2 = SP()
  for i in 0..<2 {
    var k = SP(); k.nl = (1.25, 2.3); k.fl = (0.95, 2.1); k.nfr = 0.1; k.lean = 0.75; k.tilt = 0.15; k.spear = 2
    k.na = i == 0 ? (0.8, 0.25) : (0.5, 0.9); k.fa = i == 0 ? (0.45, 0.5) : (0.75, 0.3)
    if i == 0 { k1 = k } else { k2 = k }
  }
  r += [k1, k2]
  // с ношей: руки прижимают груз к груди
  for i in 0..<7 {
    var P = i == 0 ? SP() : walk(i - 1)
    P.na = (0.2, 1.55); P.fa = (0.1, 1.6); P.spear = 2
    P.lean = 0.2 + (P.lean - 0.26) * 0.5
    r.append(P)
  }
  // 20-21 — рубка: топор на полпути вниз и отдача после удара
  var c3 = c1, c4 = c2
  c3.lean = 0.3; c3.tilt = -0.1; c3.na = (2.2, 0.35); c3.fa = (2.05, 0.35); c3.axe = 2.2 + 0.35 + 0.75
  c4.lean = 0.42; c4.tilt = 0.0; c4.na = (0.95, 0.75); c4.fa = (0.8, 0.75); c4.axe = 0.95 + 0.75 + 1.25
  r += [c3, c4]
  // 22 — стоит и оглядывается: голова задрана, принюхивается
  var lk = SP()
  lk.tilt = -0.5; lk.lean = 0.2; lk.na = (0.05, 0.25); lk.fa = (-0.12, 0.3)
  r.append(lk)
  // 23-28 — бег в атаку: корпус наклонён вперёд, шаг шире, колени выше, голова поднята — смотрит на цель
  for i in 0..<6 {
    let f = 2 * F.pi * F(i) / 6, s = sin(f), c = cos(f)
    var P = walk(i)
    P.nl = (0.75 * s, 0.3 + 1.1 * max(0, c)); P.fl = (-0.75 * s, 0.3 + 1.1 * max(0, -c))
    P.nfr = -0.35 * max(0, c); P.ffr = -0.35 * max(0, -c)
    P.lean = 0.55 + 0.05 * cos(2 * f); P.tilt = -0.38 + 0.05 * sin(2 * f)
    P.na = (-0.9 * s, 0.9); P.fa = (0.9 * s, 0.9)
    if L.spear { P.na = (0.55 - 0.1 * s, 0.9); P.spearAng = 1.85 + 0.05 * s }
    if L.bigAxe { P.na = (0.7 - 0.1 * s, 1.5); P.spearAng = 3.3 + 0.05 * s }
    r.append(P)
  }
  // 29-31 — сидит на скамье у очага: ждёт (руки на коленях), жуёт с мясом в руке, откусывает
  for i in 0..<3 {
    var P = SP()
    P.nl = (1.45, 1.5); P.fl = (1.35, 1.5); P.nfr = 0; P.ffr = 0
    P.lean = 0.18; P.tilt = -0.05; P.spear = 2
    P.fa = (0.75, 0.55)
    if i == 0 { P.na = (0.6, 0.75) }
    if i == 1 { P.na = (0.55, 1.25); P.food = true; P.tilt = -0.02 }
    if i == 2 { P.na = (0.95, 1.6); P.food = true; P.tilt = 0.14; P.lean = 0.28 }
    r.append(P)
  }
  return r
}

// ---------- спереди / сзади ----------
struct FP { var liftL: F = 0, liftR: F = 0, bob: F = 0, rot: F = 0, dx: F = 0, swL: F = 0, swR: F = 0, carry = false, turn: F = 0 }

func front(_ L: Look, _ P: FP, back: Bool) {
  parts = []
  // для вида со спины лево и право меняются местами
  let m: F = back ? -1 : 1
  let B = L.bulk
  func legPts(_ s: F, _ lift: F) -> (CGPoint, CGPoint, CGPoint) {
    let hip = p(s * (8 + 2 * B), 0), kn = p(s * (12 + 2 * B), 18 - 3 * B - lift * 0.5 - P.bob * 0.5), an = p(s * (10 + 2 * B), 34 - 6 * B - lift * 1.4 - P.bob)
    return (hip, kn, an)
  }
  let l = legPts(-1, P.liftL), r = legPts(1, P.liftR)
  let gy = max(l.2.y, r.2.y) + 10
  let base = CGAffineTransform(scaleX: L.scale, y: L.scale).translatedBy(x: 0, y: -gy)
  xf = base
  for (s, g) in [(F(-1), l), (F(1), r)] {
    add([capsule(g.0, g.1, 8.5 + 2.5 * B, 7 + 2 * B), capsule(g.1, g.2, 7 + 2 * B, 6 + 2 * B), ellipse(g.2 + p(s * 4, back ? 3 : 5), 11 + 2 * B, 6.5 + B)], SKIN)
  }
  xf = base.translatedBy(x: P.dx, y: 0).rotated(by: P.rot)
  let hs = L.hs, H = p(0, -36 + 2 * B) + p(0, -14 * hs)
  // копьё за спиной (с ношей) — позади всего
  if L.bigAxe && P.carry && !back { bigAxe(p(16, 4), F.pi + 0.36) }
  if L.spear && P.carry && !back {
    add([capsule(p(18, 8), p(-22, -96), 2.4, 2.2)], WOOD)
    let u = p(-22 - 18, -104) * (1 / hypot(40, 104)), n = p(-u.y, u.x), tip = p(-22, -96)
    add([smooth([tip + n * 5.5, tip + u * 16, tip - n * 5.5, tip - u * 4])], STONE)
  }
  // торс: у коренастых — широкие плечи, грудь бочкой и узкий таз
  let tw = { (x: F, k: F) -> F in x * (1 + k * B) }
  add([smooth([p(tw(-14, -0.04), 2), p(tw(-16, 0.06), -12), p(tw(-19, 0.5), -26), p(tw(-15, 0.85), -35), p(tw(-6, 1.3), -40), p(tw(6, 1.3), -40), p(tw(15, 0.85), -35), p(tw(19, 0.5), -26), p(tw(16, 0.06), -12), p(tw(14, -0.04), 2), p(0, 5)])], SKIN)
  func hemLine(_ x0: F, _ x1: F, _ y: F, _ teeth: Int, _ depth: F) -> [CGPoint] {
    (0...teeth * 2).map { i in p(x0 + (x1 - x0) * F(i) / F(teeth * 2), y + (i % 2 == 1 ? depth : 0)) }
  }
  if L.dress {
    let k = 1 + 0.25 * B
    let top = [p(-18 * k * m, -31), p(-10 * k * m, -35), p(14 * k * m, -21), p(18 * k * m, -8), p(19 * m, 6)]
    add([smooth(top + hemLine(20 * m, -20 * m, 16 - 4 * B, 4, 6) + [p(-19 * m, 4), p(-18 * k * m, -12)])], FUR)
  } else {
    let w = 1 + 0.15 * B
    add([smooth([p(-16 * w, -7), p(0, -5), p(16 * w, -7), p(17 * w, 4)] + hemLine(16 * w, -16 * w, 8, 3, 7))], FUR)
  }
  if L.spear && P.carry && back {
    add([capsule(p(-18, 8), p(22, -96), 2.4, 2.2)], WOOD)
  }
  if L.bigAxe && P.carry && back { bigAxe(p(-16, 4), F.pi - 0.36) }
  // руки
  func arm(_ s: F, _ sw: F, _ hold: Bool) {
    // плечи шире, руки толще и висят дальше от тела, кулаки крупные
    let o = 10 * B, r0 = 7 + 3.5 * B, r1 = 6 + 2.2 * B, rh = 6.8 + 1.8 * B
    let sh = p(s * (16 + o), -31 - B)
    var el = p(s * (22 + o), -12 - sw * 3), wr = p(s * (22 + o * 0.8), 4 - sw * 8)
    if P.carry { el = p(s * (22 + o), -14); wr = p(s * 9, -16) }
    if hold { el = p(s * (22 + o), -14); wr = p(s * (21 + o * 0.8), -2) }
    if back && P.carry {
      add([capsule(sh, el, r0, r1)], SKIN, halo: true)
      return
    }
    let hand = wr + p(0, 3)
    if hold && L.spear { spear(hand, F.pi + s * 0.1) }
    // топор: спереди висит в левой руке лезвием вниз и наружу, сзади — в правой лезвием вверх
    if hold && L.bigAxe { if s < 0 { bigAxe(hand + p(0, -26), 0.06) } else { bigAxe(hand, F.pi + 0.1) } }
    add([capsule(sh, el, r0, r1), capsule(el, wr, r1, r1 - 0.5), ellipse(hand, rh, rh)], SKIN, halo: true)
    if s == 1 { handOut = hand.applying(xf) }
  }
  let holdSide: F = back ? 1 : -1
  let spearHeld = L.armed && !P.carry
  if back { drawHead(L, H, back: true, turn: P.turn) }
  arm(-1, P.swL, spearHeld && holdSide == -1)
  arm(1, P.swR, spearHeld && holdSide == 1)
  if !back { drawHead(L, H, back: false, turn: P.turn) }
}

let CROWN_BAND = [p(-20, -10), p(-16, -16), p(-9, -20), p(0, -21), p(9, -20), p(16, -16), p(20, -10)]

func drawHead(_ L: Look, _ H0: CGPoint, back: Bool, turn: F = 0) {
  let hs = L.hs
  // поворот головы: лицо и борода смещаются в сторону взгляда, голова чуть наклоняется
  let H = H0 + p(turn * 1.5, 0) * hs, fx = turn * 6
  func at(_ pts: [CGPoint]) -> [CGPoint] { tr(pts, H, turn * 0.08, hs) }
  func face(_ pts: [CGPoint]) -> [CGPoint] { at(pts.map { p($0.x + fx * (1 - abs($0.x) / 24), $0.y) }) }
  let hl = L.hairLen
  add([smooth(at([p(-16, -2), p(-14, -13), p(0, -18), p(14, -13), p(16, -2), p(15, 9), p(9, 16), p(0, 18), p(-9, 16), p(-15, 9)]))], SKIN)
  let hair = [p(-21, 4 + 20 * hl), p(-21, 4), p(-19, -10), p(-12, -20), p(0, -23), p(12, -20), p(19, -10), p(21, 4), p(21, 4 + 20 * hl)]
  if back {
    if L.beard { add([smooth(shaggy(at([p(-18, 0), p(18, 0), p(17, 16), p(-17, 16)]), amp: 3 * hs, step: 3.2 * hs, s0: 7))], L.hair) }
    add([smooth(shaggy(at(hair + [p(12, 2 + 22 * hl), p(0, 6 + 22 * hl), p(-12, 2 + 22 * hl)]), amp: 4 * hs, step: 3.6 * hs, s0: 3))], L.hair)
    if L.crown { crown(at(CROWN_BAND), H + p(0, 2) * hs, hs, skull: nil) }
    return
  }
  // волосы по бокам и сверху, лицо видно
  add([smooth(shaggy(at(hair + [p(15, 2 + 18 * hl), p(15, 4), p(13, -8), p(6, -12), p(0, -10), p(-6, -13), p(-13, -8), p(-15, 4), p(-15, 2 + 18 * hl)]), amp: 4 * hs, step: 3.6 * hs, s0: 3))], L.hair)
  if L.beard {
    let b = [p(-16, -2), p(-10, 2), p(-5, 0), p(-4, 6), p(4, 6), p(5, 0), p(10, 2), p(16, -2), p(17, 10), p(12, 22), p(4, 28), p(-4, 28), p(-12, 22), p(-17, 10)]
    add([smooth(shaggy(face(b), amp: 3.2 * hs, step: 3.2 * hs, s0: 7))], L.hair)
    add([ellipse(H + p(fx, 12) * hs, 3.5 * hs, 1.6 * hs)], 0x1e1009, outline: false)
  } else {
    mark(face([p(-3, 11), p(3, 11)]), shade(SKIN, 0.55), 1.8)
  }
  mark(face([p(-12, -6), p(-5, -7.5), p(0, -5.5), p(5, -7.5), p(12, -6)]), L.hair, 4.2 * hs)
  for x in [F(-6), 6] { add([ellipse(H + p(x + fx * 0.8, -2) * hs, 1.9 * hs, 2.1 * hs)], 0x1a0e06, outline: false) }
  add([ellipse(H + p(fx * 1.2, 4) * hs, 4.8 * hs, 4.3 * hs)], shade(SKIN, 0.95), outline: false)
  if L.crown { crown(at(CROWN_BAND), H + p(0, 2) * hs, hs, skull: H + p(fx * 0.6, -21) * hs) }
}

func frontPoses(_ L: Look) -> [FP] {
  var r: [FP] = [FP()]
  func walk(_ i: Int) -> FP {
    let f = 2 * F.pi * F(i) / 6, s = sin(f)
    return FP(liftL: max(0, s) * 9, liftR: max(0, -s) * 9, bob: 2.5 * (1 - abs(s)), rot: 0.09 * s, dx: 2.5 * s, swL: max(0, -s), swR: max(0, s))
  }
  for i in 0..<6 { r.append(walk(i)) }
  for i in 0..<7 { var P = i == 0 ? FP() : walk(i - 1); P.carry = true; P.rot *= 0.6; r.append(P) }
  // 14-15 — стоит и смотрит влево / вправо
  r += [FP(turn: -1), FP(turn: 1)]
  return r
}

// ---------- малыш на четвереньках (только сбоку) ----------

/// Голова сбоку: лицо смотрит вперёд (+x), ta — наклон.
func sideHead(_ L: Look, _ H: CGPoint, _ ta: F) {
  let hs = L.hs
  let face = [p(-15, -2), p(-12, -13), p(-2, -18), p(9, -15), p(15, -8), p(17, -3), p(15, 1), p(16, 7), p(14, 11), p(11, 16), p(3, 18), p(-6, 16), p(-13, 9)]
  add([smooth(tr(face, H, ta, hs))], SKIN)
  add([ellipse(H + rot(p(18, 3) * hs, ta), 5.5 * hs, 5 * hs)], shade(SKIN, 0.97))
  let hl = L.hairLen
  let hair = [p(13, -12), p(9, -19), p(-2, -23), p(-13, -19), p(-20, -8), p(-21, 6), p(-20, 6 + 20 * hl), p(-16, 8 + 20 * hl), p(-9, 6 + 16 * hl), p(-6, 12), p(-4, 4), p(0, -5), p(6, -9)]
  add([smooth(shaggy(tr(hair, H, ta, hs), amp: 4 * hs, step: 3.6 * hs, s0: 3))], L.hair)
  mark(tr([p(4, -6), p(11, -8), p(17, -5)], H, ta, hs), L.hair, 4.2 * hs)
  add([ellipse(H + rot(p(11, -1.5) * hs, ta), 1.9 * hs, 2.1 * hs)], 0x1a0e06, outline: false)
  mark(tr([p(12, 12), p(15, 12)], H, ta, hs), shade(SKIN, 0.55), 1.8)
}

/// Кадр 0 — сидит на земле, 1–4 — ползёт: рука и противоположное колено шагают вместе. Земля — y = 0.
func crawl(_ L: Look, _ frame: Int) {
  parts = []
  xf = CGAffineTransform(scaleX: L.scale, y: L.scale)
  let far = shade(SKIN, FAR)
  let foot = [p(-8, -3), p(-9, 4), p(-5, 9), p(10, 9), p(21, 8), p(25, 4), p(21, -1), p(11, -3), p(2, -7)]
  if frame == 0 {
    // сидит: ноги вытянуты вперёд, руки на коленях
    let hip = p(-6, -16), sh = p(0, -54)
    add([capsule(hip, p(22, -12), 11, 9), capsule(p(22, -12), p(38, -9), 9, 8), smooth(tr(foot, p(40, -14), -1.5, 0.9))], far)
    add([smooth([hip + p(-15, 4), hip + p(-17, -16), sh + p(-12, 2), sh + p(4, -6), sh + p(15, 4), hip + p(18, -6), hip + p(12, 12), hip + p(-6, 14)])], SKIN)
    add([capsule(hip + p(6, 2), p(26, -8), 11, 9), capsule(p(26, -8), p(42, -5), 9, 8), smooth(tr(foot, p(44, -10), -1.5, 0.9))], SKIN)
    add([smooth([hip + p(-17, -10), hip + p(16, -10), hip + p(18, 8), hip + p(4, 12), hip + p(-14, 10)] + (L.dress ? [hip + p(-18, 0)] : []))], FUR)
    add([capsule(sh + p(6, 4), p(14, -30), 7, 6), capsule(p(14, -30), p(28, -18), 6, 5.5), ellipse(p(30, -18), 6.8, 6.8)], SKIN, halo: true)
    sideHead(L, sh + p(6, -16), -0.05)
    return
  }
  let f = 2 * F.pi * F(frame - 1) / 4, s = sin(f), c = cos(f)
  let bob = 2 * abs(s)
  let hip = p(-20, -40 + bob), sh = p(20, -44 + bob)
  /// Рука от плеча до ладони на земле (выносится вперёд, когда фаза идёт вперёд).
  func arm(_ ph: F, _ col: UInt32, halo: Bool) {
    let hand = p(24 + 10 * sin(ph), -6 - 7 * max(0, cos(ph))), el = (sh + hand) * 0.5 + p(-6, 0)
    add([capsule(sh, el, 7, 6), capsule(el, hand, 6, 5.5), ellipse(hand + p(3, 2), 7, 5.5)], col, halo: halo)
  }
  /// Нога: колено на земле, голень лежит назад.
  func leg(_ ph: F, _ col: UInt32) {
    let knee = p(-12 + 10 * sin(ph), -8 - 6 * max(0, cos(ph))), ankle = knee + p(-24, -4 - 4 * max(0, cos(ph)))
    // голень лежит назад, ступня подошвой вверх
    add([capsule(hip, knee, 11, 9), capsule(knee, ankle, 9, 7), smooth([ankle + p(2, -6), ankle + p(-10, -8), ankle + p(-14, -2), ankle + p(-8, 5), ankle + p(4, 5)])], col)
  }
  leg(f, far)
  arm(f + .pi, far, halo: false)
  // туловище почти горизонтально, попа чуть выше плеч
  add([smooth([hip + p(-16, -2), hip + p(-8, -14), sh + p(-4, -14), sh + p(12, -6), sh + p(12, 10), hip + p(10, 14), hip + p(-12, 10)])], SKIN)
  leg(f + .pi, SKIN)
  add([smooth([hip + p(-18, -6), hip + p(12, -10), hip + p(16, 10), hip + p(0, 16), hip + p(-16, 10)] + (L.dress ? [hip + p(-20, 2)] : []))], FUR)
  arm(f, SKIN, halo: true)
  sideHead(L, sh + p(18, -12), -0.35 + 0.05 * c)
}

let looks: [(String, Look)] = [
  ("man", Look()),
  ("warrior", Look(spear: true)),
  ("woman", Look(scale: 1 / 1.08, hs: 0.88, beard: false, dress: true, hairLen: 1.9, hair: 0x452a17, bulk: 0.55)),
  ("man-king", Look(crown: true)),
  ("warrior-king", Look(spear: true, crown: true)),
  ("axeman", Look(bigAxe: true)),
  ("axeman-king", Look(crown: true, bigAxe: true)),
  ("woman-queen", Look(scale: 1 / 1.08, hs: 0.88, beard: false, dress: true, hairLen: 1.9, hair: 0x452a17, crown: true, bulk: 0.55)),
  ("boy", Look(scale: 0.6, hs: 1.3, beard: false, hairLen: 0.4, bulk: 0.35)),
  ("girl", Look(scale: 0.58, hs: 1.3, beard: false, dress: true, hairLen: 1.1, hair: 0x452a17, bulk: 0.2)),
]
/// Возраст: молодой мужчина без бороды (-young), седые старики (-old). Одежда у них та же — слой *-color общий с основным видом.
let GREY: UInt32 = 0x8f8a82
var ageLooks: [(String, Look, Bool)] = looks.map { ($0.0, $0.1, true) }
for (name, L) in looks where L.scale >= 0.7 {
  if L.beard { var y = L; y.beard = false; ageLooks.append((name + "-young", y, false)) }
  var o = L; o.hair = GREY; ageLooks.append((name + "-old", o, false))
}
var json: [String: Any] = [:]
var handsJson: [String: Any] = [:]
for (name, L, withColor) in ageLooks {
  let child = L.scale < 0.7
  let (sw, fw, h): (Int, Int, Int) = child ? (104, 88, 128) : (196, 128, 208)
  let ay: F = child ? 122 : 200
  let sax: F = child ? 44 : 60
  gradA = p(-34, -125) * L.scale; gradB = p(36, 0) * L.scale
  let sp = sidePoses(L), fp = frontPoses(L)
  handsJson[name + "-side"] = strip("person/\(name)-side", sp.count, sw, h, sax, ay) { side(L, sp[$0]) }
  handsJson[name + "-front"] = strip("person/\(name)-front", fp.count, fw, h, F(fw) / 2, ay) { front(L, fp[$0], back: false) }
  handsJson[name + "-back"] = strip("person/\(name)-back", fp.count, fw, h, F(fw) / 2, ay) { front(L, fp[$0], back: true) }
  // слой одежды: в игре красится в цвет племени
  if withColor {
  tintOf = FUR
  _ = strip("person/\(name)-side-color", sp.count, sw, h, sax, ay) { side(L, sp[$0]) }
  _ = strip("person/\(name)-front-color", fp.count, fw, h, F(fw) / 2, ay) { front(L, fp[$0], back: false) }
  _ = strip("person/\(name)-back-color", fp.count, fw, h, F(fw) / 2, ay) { front(L, fp[$0], back: true) }
  tintOf = nil
  }
  for (v, n, w, ax) in [("side", sp.count, sw, sax), ("front", fp.count, fw, F(fw) / 2), ("back", fp.count, fw, F(fw) / 2)] {
    for suffix in withColor ? ["", "-color"] : [""] {
      json["person/\(name)-\(v)\(suffix)"] = ["file": "person/\(name)-\(v)\(suffix).png", "frames": n, "w": w, "h": h, "ax": Double(ax) / Double(w), "ay": Double(ay) / Double(h), "scale": 0.5]
    }
  }
}
// малыши ползают: кадр 0 — сидит, 1–4 — ползёт
for (name, L) in looks where L.scale < 0.7 {
  let (w, h, ax, ay): (Int, Int, F, F) = (130, 96, 64, 88)
  gradA = p(-34, -70) * L.scale; gradB = p(36, 0) * L.scale
  for suffix in ["", "-color"] {
    tintOf = suffix.isEmpty ? nil : FUR
    _ = strip("person/baby-\(name)-side\(suffix)", 5, w, h, ax, ay) { crawl(L, $0) }
    json["person/baby-\(name)-side\(suffix)"] = ["file": "person/baby-\(name)-side\(suffix).png", "frames": 5, "w": w, "h": h, "ax": Double(ax) / Double(w), "ay": Double(ay) / Double(h), "scale": 0.5]
  }
  tintOf = nil
}
saveManifest(json)
for (k, v) in handsJson.sorted(by: { $0.key < $1.key }) where !k.contains("-young") && !k.contains("-old") {
  let h = v as! [[F]], first = k.hasSuffix("-side") ? 13 : 7
  print("руки с ношей \(k): \(h[first])")
}
