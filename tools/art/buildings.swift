// Генератор картинок построек: хижина, склад и кузница (готовые, три этапа стройки, флажок) и ратуша (здание, флажок).
// Запуск из корня репозитория: tools/art/run.sh buildings
// Пишет apps/client/public/assets/building/*.png и обновляет их описание в sprites.json.
// Флажки и ленточки — отдельные анимированные полосы (flag, ribbon); их слой *-color красят в цвет племени.

let HIDE: UInt32 = 0xa07a4e
let LOG: UInt32 = 0x7a5532
let LOGEND: UInt32 = 0xc9a46c
let BASKET: UInt32 = 0xb08650
let IVORY: UInt32 = 0xe2d4b0
let DARK: UInt32 = 0x2e1c10
let FLAG: UInt32 = 0xf0f0f0

/// Все детали построек лежат друг на друге, поэтому у каждой своя полная обводка.
func part(_ ps: [CGPath], _ c: UInt32) { add(ps, c, halo: true) }

func ring(_ c: CGPoint, _ r: F) -> [CGPoint] { (0...16).map { c + p(cos(F($0) / 16 * 2 * .pi), sin(F($0) / 16 * 2 * .pi)) * r } }

/// Полотнище колышется: по нему от шеста бежит волна (phase — её фаза), у шеста оно неподвижно.
func wave(_ pts: [CGPoint], _ phase: F, amp: F, len: F) -> [CGPoint] {
  pts.map { q in
    let u = max(0, q.x) / len
    return p(q.x * (1 - 0.05 * u * (1 + cos(phase - u * 5))), q.y + amp * u * sin(phase - u * 5))
  }
}

/// Флажок у верхушки шеста (0, 0), кадр i из 8. В основной полосе — с обводкой, в цветной — только полотнище.
func flagFrame(_ i: Int, colorOnly: Bool) {
  parts = []; xf = .identity
  gradA = p(0, -10); gradB = p(60, 40)
  let pts = [p(3, 2), p(17, 0), p(31, 2), p(45, 5), p(60, 10), p(52, 22), p(58, 34), p(44, 32), p(30, 30), p(16, 32), p(3, 34)]
  let cloth = smooth(wave(pts, 2 * .pi * F(i) / 8, amp: 4.5, len: 60))
  if colorOnly { add([cloth], FLAG, outline: false) } else { part([cloth], FLAG) }
}

func bone(_ a: CGPoint, _ b: CGPoint, _ r: F) {
  let d0 = b - a, d = d0 * (1 / hypot(d0.x, d0.y)), n = p(-d.y, d.x)
  part([capsule(a, b, r, r), ellipse(a + n * r * 0.9, r * 1.3, r * 1.3), ellipse(a - n * r * 0.9, r * 1.3, r * 1.3),
        ellipse(b + n * r * 0.9, r * 1.3, r * 1.3), ellipse(b - n * r * 0.9, r * 1.3, r * 1.3)], IVORY)
}

// Камера смотрит чуть сверху (~25°): глубина на картинке сжата до 0.42, высота — до 0.9.
// Крыша видна немного, дальний край стоит чуть выше ближнего.
let DEPTH_K: F = 0.42, HEIGHT_K: F = 0.9

/// Основание построек на земле (центр по y от точки опоры, полуоси) — в пикселях картинки.
/// Пишется в sprites.json как base, по нему игра рисует круг выделения и круг при постройке.
// ---------- склад: круглый навес — шатёр из шкур на столбах по кругу, под ним поленница и корзины ----------

let ST_R: F = 128, ST_H: F = 118, ST_ROOF: F = 85, ST_EAVE: F = 140
let ST_C = p(0, -ST_R * DEPTH_K)
let STORAGE_BASE = (y: ST_C.y, rx: ST_R, ry: ST_R * DEPTH_K)
/// Верхушка шеста с флажком.
let ST_POLE = ST_C + p(0, -(ST_H + ST_ROOF) * HEIGHT_K - 46)
/// Точка на земле по кругу радиуса r (φ = 0 — ближе всего к нам) и на высоте h.
func stAt(_ phi: F, _ r: F, _ h: F) -> CGPoint { ST_C + p(r * sin(phi), r * DEPTH_K * cos(phi) - h * HEIGHT_K) }

/// Крыша-шатёр склада: макушка и ближний край свеса с рваной кромкой.
func storageRoof() -> CGPath {
  let apex = stAt(0, 0, ST_H + ST_ROOF), eC = stAt(0, 0, ST_H), b = ST_EAVE * DEPTH_K, dd = eC.y - apex.y, y0 = -b * b / dd
  let a0 = asin(max(-1, y0 / b))
  var hem: [CGPoint] = []
  for i in 0...24 {
    let a = a0 + (F.pi - 2 * a0) * F(i) / 24
    hem.append(eC + p(cos(a) * ST_EAVE, sin(a) * b + (i % 2 == 1 ? 8 : 0)))
  }
  // макушка острая, кромка плавная
  let roof = CGMutablePath()
  roof.move(to: apex)
  roof.addLine(to: hem[0])
  for i in 0..<(hem.count - 1) {
    let p0 = hem[max(0, i - 1)], p1 = hem[i], p2 = hem[i + 1], p3 = hem[min(hem.count - 1, i + 2)]
    roof.addCurve(to: p2, control1: p1 + (p2 - p0) * (1 / 6), control2: p2 - (p3 - p1) * (1 / 6))
  }
  roof.closeSubpath()
  return roof
}

/// Брёвна, сложенные на земле: торцы смотрят на нас.
func logEnds(_ at: CGPoint, _ rows: [Int], _ r: F) {
  for (row, n) in rows.enumerated() {
    for i in 0..<n {
      let c = at + p(F(i) * r * 1.86 + F(row) * r * 0.93, -F(row) * r * 1.6)
      part([ellipse(c, r, r * 0.93)], LOGEND)
      mark(ring(c, r * 0.45), shade(LOGEND, 0.72), 2)
    }
  }
}

func storage(_ stage: Int) {
  // 0 — готовый, 1–3 — этапы стройки (столбы → каркас → крыша наполовину)
  parts = []
  xf = .identity
  gradA = p(-150, -260); gradB = p(150, 0)
  let apex = stAt(0, 0, ST_H + ST_ROOF)
  // основание на земле — тот же эллипс, что круг выделения в игре
  add([ellipse(ST_C, ST_R, ST_R * DEPTH_K)], 0x5c4a32, outline: false)
  let posts: [F] = [-2.3, 2.3, -0.75, 0.75]
  func post(_ phi: F) { part([capsule(stAt(phi, ST_R * 0.9, 0), stAt(phi, ST_R * 0.9, ST_H + 4), 6.5, 5.5)], abs(phi) > 1.5 ? shade(LOG, 0.7) : LOG) }
  for phi in posts where abs(phi) > 1.5 { post(phi) }
  if stage == 1 {
    // вкопаны только дальние столбы, ближние лежат на земле, рядом брёвна
    part([capsule(p(-96, -14), p(10, -4), 7, 6)], LOG)
    part([capsule(p(-40, 4), p(76, -8), 7, 6)], shade(LOG, 0.92))
    logEnds(p(52, -40), [3, 2], 13)
    return
  }
  if stage == 0 || stage == 3 { logEnds(p(-92, -24), [4, 3, 2], 14.5) }
  if stage == 0 {
    // корзины с ягодами справа
    for (x, y, k) in [(F(40), F(-40), F(0.9)), (F(78), F(-20), F(1))] {
      let b = p(x, y)
      part([smooth([b + p(-23, -30) * k, b + p(23, -30) * k, b + p(19, 4) * k, b + p(-19, 4) * k])], BASKET)
      mark([b + p(-21, -14) * k, b + p(21, -14) * k], shade(BASKET, 0.7), 2)
      part([ellipse(b + p(0, -30) * k, 24 * k, 6 * k)], shade(BASKET, 0.8))
      for (dx, dy) in [(-11, -32), (0, -34), (11, -32), (-5, -30), (6, -30)] {
        add([ellipse(b + p(F(dx), F(dy)) * k, 5.5 * k, 4 * k)], 0xb83a2c, outline: false)
      }
    }
  }
  for phi in posts where abs(phi) < 1.5 { post(phi) }
  if stage == 2 || stage == 3 {
    // обвязка по верху столбов и жерди к макушке
    let top = stAt(0, 0, ST_H)
    let rim = CGPath(ellipseIn: CGRect(x: top.x - ST_R * 0.9, y: top.y - ST_R * 0.9 * DEPTH_K, width: ST_R * 1.8, height: ST_R * 1.8 * DEPTH_K), transform: nil)
    part([rim.copy(strokingWithWidth: 8, lineCap: .round, lineJoin: .round, miterLimit: 1)], LOG)
    for phi in [F(-2.3), 2.3, -0.75, 0.75] { part([capsule(stAt(phi, ST_R * 0.9, ST_H), apex, 3.5, 3.5)], shade(LOG, abs(phi) > 1.5 ? 0.75 : 1)) }
  }
  if stage == 2 {
    part([capsule(p(-60, -26), p(40, -30), 9, 9)], LOG)
    part([capsule(p(-30, -48), p(70, -52), 9, 9)], shade(LOG, 0.9))
    // свёрнутые шкуры ждут своей очереди
    part([capsule(p(54, -14), p(96, -22), 13, 12)], HIDE)
    return
  }
  // крыша: на третьем этапе шкуры накинуты только на левую половину
  let eC = stAt(0, 0, ST_H), b = ST_EAVE * DEPTH_K
  var roof = storageRoof()
  if stage == 3 {
    let half = CGMutablePath()
    half.addLines(between: [apex + p(-300, -40), apex + p(12, -40), apex + p(4, 0), eC + p(-6, b + 30), eC + p(-300, b + 30)])
    half.closeSubpath()
    roof = roof.intersection(half)
  }
  part([roof], HIDE)
  // швы между шкурами сходятся к макушке
  for phi in (stage == 3 ? [F(-1.2), -0.6] : [F(-1.2), -0.6, 0, 0.6, 1.2]) {
    let e = eC + p(ST_EAVE * sin(phi), b * cos(phi))
    mark([apex + (e - apex) * 0.12, apex + (e - apex) * 0.92], shade(HIDE, 0.78), 2.5)
  }
  if stage == 3 {
    part([capsule(p(60, -16), p(92, -22), 11, 10)], HIDE)
    return
  }
  part([capsule(apex + p(0, 6), ST_POLE, 3.5, 3)], LOG)
}

// ---------- хижина: вигвам из шкур на жердях ----------

let HUT_R: F = 118, HUT_H: F = 230
let HUT_C = p(0, -HUT_R * DEPTH_K), HUT_TOP = HUT_C + p(0, -HUT_H * HEIGHT_K)
/// Где на жерди вигвама висит ленточка.
let HUT_RIBBON: CGPoint = {
  let b = HUT_C + p(HUT_R * sin(0.4), HUT_R * DEPTH_K * cos(0.4)), d = HUT_TOP - b
  return HUT_TOP + d * (60 / hypot(d.x, d.y)) + p(-2, 6)
}()
/// Точка на краю основания вигвама: φ = 0 — ближе всего к нам.
func hutBase(_ phi: F) -> CGPoint { HUT_C + p(HUT_R * sin(phi), HUT_R * DEPTH_K * cos(phi)) }
/// Точка на склоне: t = 0 у земли, 1 — макушка.
func hutSide(_ phi: F, _ t: F) -> CGPoint { hutBase(phi) * (1 - t) + HUT_TOP * t }

/// Ленточка цвета племени у верхушки жерди (0, 0), кадр i из 8.
func ribbonFrame(_ i: Int, colorOnly: Bool) {
  parts = []; xf = .identity
  gradA = p(0, -10); gradB = p(36, 20)
  let pts = [p(0, -3), p(12, -1), p(24, 3), p(38, 11), p(26, 10), p(13, 9), p(2, 8)]
  let r = smooth(wave(pts, 2 * .pi * F(i) / 8, amp: 4, len: 38))
  if colorOnly { add([r], FLAG, outline: false) } else { part([r], FLAG) }
}

/// Контур покрышки вигвама: от макушки по касательной слева, по ближнему краю основания до φ = toPhi.
func hutCover(toPhi: F) -> CGPath {
  let b = HUT_R * DEPTH_K, d = HUT_C.y - HUT_TOP.y, y0 = -b * b / d
  let a0 = asin(y0 / b), a1 = max(a0, F.pi / 2 - toPhi)
  var cone = [HUT_TOP]
  for i in 0...20 { let a = a1 + (F.pi - a0 - a1) * F(i) / 20; cone.append(HUT_C + p(cos(a) * HUT_R, sin(a) * b)) }
  let path = CGMutablePath()
  path.addLines(between: cone.reversed() + [HUT_TOP])
  path.closeSubpath()
  return path
}

func hut(_ stage: Int) {
  // 0 — готовая, 1–3 — этапы стройки (тренога → все жерди → шкуры наполовину)
  parts = []
  xf = .identity
  gradA = p(-130, -280); gradB = p(130, 0)
  let poles: [F] = [2.5, -2.4, -0.95, -0.35, 0.4, 1.0]
  let tip = { (phi: F) -> CGPoint in let d = HUT_TOP - hutBase(phi); return HUT_TOP + d * (60 / hypot(d.x, d.y)) }
  func pole(_ phi: F, from t: F = 0) {
    part([capsule(HUT_TOP + (hutBase(phi) - HUT_TOP) * (1 - t), tip(phi), 4.5, 3.5)], abs(phi) > 1.5 ? shade(LOG, 0.75) : LOG)
  }
  /// Верёвка, которой связаны жерди у макушки.
  func lashing() { part([ellipse(HUT_TOP + p(0, 4), 9, 6)], shade(HIDE, 0.7)) }
  if stage > 0 {
    // вытоптанный круг, где ставят вигвам
    add([ellipse(HUT_C, HUT_R * 0.98, HUT_R * DEPTH_K * 0.98)], 0x6a5638, outline: false)
  }
  if stage == 1 {
    // тренога из трёх жердей, остальные лежат на земле
    for phi in [F(2.5), -2.4, 0.4] { pole(phi) }
    lashing()
    part([capsule(p(-124, -16), p(-20, -4), 4.5, 3.5)], LOG)
    part([capsule(p(-110, -2), p(-4, 6), 4.5, 3.5)], shade(LOG, 0.9))
    part([capsule(p(36, -8), p(118, -20), 13, 12)], HIDE)
    return
  }
  if stage == 2 {
    for phi in poles { pole(phi) }
    lashing()
    // свёрнутые шкуры у входа
    part([capsule(p(40, -6), p(116, -18), 14, 13)], HIDE)
    part([capsule(p(52, -28), p(110, -38), 12, 11)], shade(HIDE, 0.92))
    return
  }
  if stage == 3 {
    // шкуры обёрнуты вокруг каркаса только слева, справа видны голые жерди
    for phi in poles { pole(phi) }
    lashing()
    part([hutCover(toPhi: 0.15)], HIDE)
    for phi in [F(-1.15), -0.55] { mark([hutSide(phi, 0.02), hutSide(phi, 0.9)], shade(HIDE, 0.78), 2.5) }
    for phi in poles where phi > 0.15 && abs(phi) < 1.5 { pole(phi) }
    part([capsule(p(68, -10), p(116, -20), 12, 11)], HIDE)
    return
  }
  // жерди торчат над шкурами
  for phi in poles { pole(phi, from: 0.9) }
  part([hutCover(toPhi: 9)], HIDE)
  // швы между шкурами сходятся к макушке
  for phi in [F(-1.15), -0.55, 0.55, 1.15] { mark([hutSide(phi, 0.02), hutSide(phi, 0.9)], shade(HIDE, 0.78), 2.5) }
  mark((0...12).map { hutSide(-1.4 + 2.8 * F($0) / 12, 0.55) }, shade(HIDE, 0.82), 2)
  // вход — откинутый полог
  part([smooth([hutBase(-0.24) + p(0, -3), hutSide(-0.2, 0.3), hutSide(-0.06, 0.42), hutSide(0.06, 0.42), hutSide(0.2, 0.3), hutBase(0.24) + p(0, -3), hutBase(0) + p(0, -1)])], DARK)
  part([smooth([hutSide(0.2, 0.3), hutSide(0.08, 0.42), hutSide(0.3, 0.36), hutBase(0.46) + p(0, -4), hutBase(0.3)])], shade(HIDE, 0.9))
}

// ---------- кузница: дом с каменным низом и двускатной крышей из шкур, труба горна, в двери светится огонь ----------

let STONE_B: UInt32 = 0x8a867c
let EMBER: UInt32 = 0xe0682c
let CLAY: UInt32 = 0x857560
let FG_R: F = 124
let FG_C = p(0, -FG_R * DEPTH_K)
/// Точка кузницы: x — вбок, z — к нам, h — высота.
func fgAt(_ x: F, _ z: F, _ h: F) -> CGPoint { FG_C + p(x, z * DEPTH_K - h * HEIGHT_K) }
/// Труба горна и шест с ленточкой (верхушка) — общие для картинки и игры (дым, флажок).
let FG_CHIMNEY = (x: F(-58), z: F(-34), h1: F(250))
let FG_POLE = fgAt(104, -12, 222)

func forge(_ stage: Int) {
  // 0 — готовая, 1–3 — этапы стройки (камни и столбы → стены, стропила и полтрубы → полкрыши)
  parts = []
  xf = .identity
  gradA = p(-150, -260); gradB = p(150, 0)
  let wx: F = 96, zW: F = 40, hW: F = 96, rx: F = 114, zE: F = 54, hE: F = 92, zR: F = -12, hR: F = 178
  add([ellipse(FG_C, FG_R, FG_R * DEPTH_K)], 0x5c4a32, outline: false)
  func post(_ x: F, _ z: F, _ h: F, _ k: F = 1) { part([capsule(fgAt(x, z, 0), fgAt(x, z, h), 7, 6)], shade(LOG, k)) }
  /// Труба горна из камней до высоты h: стоит за коньком, низ закрывают стена и крыша.
  func chimney(_ h: F) {
    let c = FG_CHIMNEY, b = fgAt(c.x, c.z, 0), t = fgAt(c.x, c.z, h)
    part([smooth([b + p(-20, 0), t + p(-15, 0), t + p(-14, -5), t + p(14, -5), t + p(15, 0), b + p(20, 0)])], STONE_B)
    for k in stride(from: F(0.55), to: 0.97, by: 0.14) {
      let q = b + (t - b) * k, w = 20 - 5 * k
      mark([q + p(-w + 3, 0), q + p(w - 3, 0)], shade(STONE_B, 0.75), 2)
    }
    if h >= c.h1 { add([ellipse(t + p(0, -4), 12, 4.5)], DARK, outline: false) }
  }
  func rafters() {
    for x in [-wx, -wx / 2, 0, wx / 2, wx] { part([capsule(fgAt(x, zE, hE), fgAt(x, zR, hR + 6), 4.5, 4)], shade(LOG, 0.9)) }
    part([capsule(fgAt(-rx, zR, hR), fgAt(rx, zR, hR), 6, 6)], LOG)
  }
  // дальние столбы торчат из-за стены
  if stage == 1 { for x in [-wx, wx] { post(x, -40, hW, 0.75) } }
  if stage == 2 { chimney(170) }
  if stage == 0 || stage == 3 { chimney(FG_CHIMNEY.h1) }
  if stage >= 2 || stage == 0 {
    // стена: глина на каменном основании, по углам столбы, посередине дверь
    let wall = CGMutablePath()
    wall.addLines(between: [fgAt(-wx, zW, -2), fgAt(-wx, zW, hW), fgAt(wx, zW, hW), fgAt(wx, zW, -2)])
    wall.closeSubpath()
    part([wall], CLAY)
    let door = (0...12).map { i -> CGPoint in let a = F.pi * F(i) / 12; return fgAt(14 - 30 * cos(a), zW, 72 * sin(a)) }
    if stage == 0 {
      part([smooth(door + [fgAt(-16, zW, -2), fgAt(44, zW, -2)])], DARK)
      // в глубине светится горн
      add([ellipse(fgAt(14, zW, 6), 22, 9)], EMBER, outline: false)
      add([ellipse(fgAt(14, zW, 4), 11, 5)], 0xffb050, outline: false)
    } else {
      part([smooth(door + [fgAt(-16, zW, -2), fgAt(44, zW, -2)])], shade(DARK, 1.4))
    }
    for x in [F(-16), 44] { part([capsule(fgAt(x, zW + 2, 0), fgAt(x, zW + 2, 74), 4.5, 4)], LOG) }
    part([capsule(fgAt(-20, zW + 2, 74), fgAt(48, zW + 2, 74), 4.5, 4.5)], LOG)
  }
  // нижний ряд камней вдоль стены
  for i in 0..<11 {
    let x = -wx + 2 * wx * F(i) / 10
    if x > -20 && x < 48 && stage != 1 { continue }
    part([ellipse(fgAt(x, zW + 3, 6), 11, 7.5)], shade(STONE_B, i % 2 == 0 ? 1 : 0.88))
  }
  for x in [-wx, wx] { post(x, zW + 2, stage == 1 ? hW - 10 : hW) }
  if stage == 1 {
    part([capsule(fgAt(-70, 76, 0), fgAt(20, 70, 0), 7, 6)], LOG)
    part([capsule(fgAt(-40, 92, 0), fgAt(46, 88, 0), 7, 6)], shade(LOG, 0.92))
    part([ellipse(fgAt(70, 78, 4), 12, 8), ellipse(fgAt(88, 74, 4), 10, 7)], STONE_B)
    return
  }
  if stage == 2 {
    rafters()
    part([capsule(fgAt(30, 88, 0), fgAt(96, 80, 0), 13, 12)], HIDE)
    part([capsule(fgAt(40, 70, 14), fgAt(90, 64, 14), 11, 10)], shade(HIDE, 0.92))
    return
  }
  if stage == 3 { rafters() }
  // крыша: шкуры от конька к рваной кромке над стеной; на третьем этапе — только левая половина
  let xr: F = stage == 3 ? 4 : rx
  var hem: [CGPoint] = []
  for i in 0...12 { let x = -rx + (xr + rx) * F(i) / 12; hem.append(fgAt(x, zE, hE - (i % 2 == 1 ? 9 : 2))) }
  part([smooth([fgAt(-rx - 2, zR, hR + 4), fgAt(xr, zR, hR + 4)] + hem.reversed())], HIDE)
  for x in stride(from: F(-62), to: xr - 12, by: 56) { mark([fgAt(x, zR + 4, hR), fgAt(x, zE - 2, hE + 2)], shade(HIDE, 0.78), 2.5) }
  if stage == 3 {
    part([capsule(fgAt(40, 88, 0), fgAt(100, 80, 0), 12, 11)], HIDE)
    return
  }
  // конёк: бревно, на концах жерди крест-накрест
  part([capsule(fgAt(-rx - 4, zR, hR + 4), fgAt(rx + 4, zR, hR + 4), 6, 6)], LOG)
  for x in [-rx, rx] {
    part([capsule(fgAt(x, zR + 22, hR - 18), fgAt(x - 10, zR - 10, hR + 34), 3.5, 3)], shade(LOG, 0.9))
    part([capsule(fgAt(x, zR + 22, hR - 18), fgAt(x + 10, zR - 10, hR + 34), 3.5, 3)], shade(LOG, 0.9))
  }
  part([capsule(fgAt(104, zR, hR), FG_POLE, 3.5, 3)], LOG)
  // у стены — камень-наковальня с топором и прислонённые копья
  let anvil = fgAt(-62, 80, 0)
  part([smooth([anvil + p(-30, 2), anvil + p(-26, -20), anvil + p(-4, -25), anvil + p(26, -20), anvil + p(30, 0), anvil + p(4, 7)])], STONE_B)
  add([ellipse(anvil + p(0, -19), 22, 6)], shade(STONE_B, 1.15), outline: false)
  part([capsule(anvil + p(-18, -21), anvil + p(8, -27), 2.6, 2.6)], WOOD)
  part([smooth([anvil + p(6, -23), anvil + p(16, -35), anvil + p(22, -27), anvil + p(16, -19)])], shade(STONE_B, 0.8))
  for x in [F(58), 72, 86] {
    let a = fgAt(x - 4, zW + 30, 0), b = fgAt(x + 6, zW + 4, hW - 10)
    part([capsule(a, b, 2.6, 2.4)], WOOD)
    let d = b - a, u = d * (1 / hypot(d.x, d.y)), n = p(-u.y, u.x)
    part([smooth([b + n * 5.5, b + u * 16, b - n * 5.5, b - u * 4])], STONE_B)
  }
}

// ---------- кухня под открытым небом: очаг с вертелом, вокруг брёвна-скамьи, сзади заслон от ветра из шкур ----------

let KT_R: F = 150
let CLAYPOT: UInt32 = 0x9a5a38
/// Точка кухни: x — вбок, z — к нам, h — высота; (0, 0, 0) — центр очага и точка опоры картинки.
func ktAt(_ x: F, _ z: F, _ h: F) -> CGPoint { p(x, z * DEPTH_K - h * HEIGHT_K) }
/// Заслон: столбы по дуге сзади, θ — угол (π/2 — прямо позади очага).
let KT_POLES: [F] = [0.35, 0.95, 1.57, 2.19, 2.79]
func ktPole(_ th: F, _ h: F) -> CGPoint { ktAt(cos(th) * KT_R * 0.92, -sin(th) * KT_R * 0.92, h) }
/// Кухня крупная: всё рисуется в 1.2 раза больше.
let KT_K: F = 1.2
let KT_RIBBON = ktPole(1.57, 132) * KT_K
/// Скамьи — там, где в игре сидят обедающие (KITCHEN_SEATS в units.ts = эти точки × KT_K / 2).
let KT_SEATS: [(F, F)] = [(-120, -4), (120, -4), (-68, -40), (68, -40)]

func kitchen(_ stage: Int) {
  // 0 — готовая, 1–3 — этапы стройки (очаг и брёвна → скамьи, столбы, рогатины → ползаслона)
  parts = []
  xf = CGAffineTransform(scaleX: KT_K, y: KT_K)
  gradA = p(-190, -240); gradB = p(190, 70)
  curLayer = 0
  add([ellipse(p(0, 0), KT_R, KT_R * DEPTH_K)], 0x5c4a32, outline: false)
  // заслон от ветра: шкуры между столбами (на третьем этапе — только слева)
  curLayer = 1
  let polesUp = stage == 0 || stage >= 2
  if polesUp {
    for th in KT_POLES { part([capsule(ktPole(th, 0), ktPole(th, th == 1.57 ? 128 : 104), 5, 4)], shade(LOG, 0.8)) }
  }
  if stage == 0 || stage == 3 {
    let n = stage == 3 ? 2 : KT_POLES.count - 1
    for i in 0..<n {
      let a = KT_POLES[KT_POLES.count - 1 - i], b = KT_POLES[KT_POLES.count - 2 - i]
      var pts: [CGPoint] = []
      for k in 0...6 { let th = a + (b - a) * F(k) / 6; pts.append(ktPole(th, 96 - 8 * sin(F(k) / 6 * .pi))) }
      for k in 0...6 { let th = b + (a - b) * F(k) / 6; pts.append(ktPole(th, 10 + (k % 2 == 0 ? 0 : 5))) }
      part([smooth(pts)], shade(HIDE, 0.92 + 0.08 * F(i % 2)))
    }
    for th in KT_POLES { part([capsule(ktPole(th, 0), ktPole(th, th == 1.57 ? 128 : 104), 5, 4)], shade(LOG, 0.9)) }
  }
  // скамьи-брёвна: сзади очага — раньше очага, по бокам — позже
  func bench(_ s: (F, F)) {
    let c = p(s.0, s.1 - 6)
    part([capsule(c + p(-26, 0), c + p(26, 0), 9, 9)], LOG)
    part([ellipse(c + p(26, 0), 6, 8.5)], LOGEND)
  }
  curLayer = 2
  if stage != 1 { for s in KT_SEATS where s.1 < -20 { bench(s) } }
  // очаг: кольцо камней, угли
  curLayer = 3
  add([ellipse(p(0, 0), 40, 17)], 0x3a2c22, outline: false)
  if stage == 0 { add([ellipse(p(0, -1), 28, 11)], EMBER, outline: false); add([ellipse(p(-3, -2), 14, 5)], 0xffb050, outline: false) }
  for i in 0..<12 {
    let a = F(i) / 12 * 2 * .pi
    if sin(a) > 0.3 { continue }
    part([ellipse(p(cos(a) * 40, sin(a) * 17 - 3), 9, 6.5)], shade(STONE_B, 0.8))
  }
  // вертел: две рогатины и перекладина с куском мяса над огнём
  if stage == 0 || stage >= 2 {
    for x in [F(-46), 46] {
      part([capsule(ktAt(x, 0, 0), ktAt(x, 0, 64), 3.5, 3)], WOOD)
      part([capsule(ktAt(x, 0, 60), ktAt(x - 8, 0, 76), 2.5, 2.2), capsule(ktAt(x, 0, 60), ktAt(x + 8, 0, 76), 2.5, 2.2)], WOOD)
    }
  }
  if stage == 0 || stage == 3 { part([capsule(ktAt(-56, 0, 66), ktAt(56, 0, 66), 2.8, 2.8)], shade(WOOD, 1.1)) }
  if stage == 0 {
    part([smooth([ktAt(-16, 0, 70), ktAt(0, 0, 76), ktAt(18, 0, 70), ktAt(20, 0, 54), ktAt(4, 0, 44), ktAt(-14, 0, 50)])], 0x8a3a24)
    add([ellipse(ktAt(-4, 0, 66), 7, 3)], 0xb85a3a, outline: false)
  }
  // ближние камни очага — поверх огня и вертела
  for i in 0..<12 {
    let a = F(i) / 12 * 2 * .pi
    if sin(a) <= 0.3 { continue }
    part([ellipse(p(cos(a) * 40, sin(a) * 17 - 3), 9, 6.5)], STONE_B)
  }
  // дрова слева спереди
  curLayer = 5
  logEnds(p(-130, 44), stage == 1 ? [3, 2] : [3, 2, 1], 10)
  if stage == 1 {
    part([capsule(p(30, 40), p(130, 30), 7, 6)], LOG)
    part([capsule(p(40, 58), p(134, 50), 7, 6)], shade(LOG, 0.92))
    return
  }
  curLayer = 4
  for s in KT_SEATS where s.1 >= -20 { bench(s) }
  curLayer = 5
  if stage == 2 {
    part([capsule(p(60, 50), p(126, 40), 13, 12)], HIDE)
    return
  }
  if stage == 3 { return }
  // у повара: глиняный горшок и корзина с ягодами
  let pot = p(30, 38)
  part([smooth([pot + p(-16, 0), pot + p(-18, -18), pot + p(-11, -28), pot + p(11, -28), pot + p(18, -18), pot + p(16, 0)])], CLAYPOT)
  add([ellipse(pot + p(0, -27), 11, 3.5)], DARK, outline: false)
  let bk = p(100, 46)
  part([smooth([bk + p(-20, -26), bk + p(20, -26), bk + p(16, 4), bk + p(-16, 4)])], BASKET)
  part([ellipse(bk + p(0, -26), 21, 5)], shade(BASKET, 0.8))
  for (dx, dy) in [(-9, -28), (0, -30), (9, -28), (-4, -26), (5, -26)] { add([ellipse(bk + p(F(dx), F(dy)), 5, 3.6)], 0xb83a2c, outline: false) }
}

/// Открытая постройка по слоям: building/<name>-floor — земля (лежит под всеми), <name>-props — по кадру на предмет;
/// props в sprites.json — y основания каждого предмета (единицы мира от точки опоры), по нему игра сортирует глубину.
func layered(_ name: String, _ w: Int, _ h: Int, _ ax: F, _ ay: F, props: [F], _ draw: @escaping (Int) -> Void) {
  want = 0
  put(name + "-floor", w, h, ax, ay) { _ in draw(0) }
  put(name + "-props", w, h, ax, ay, frames: props.count) { i in want = i + 1; draw(0) }
  want = nil
  var e = entries["building/" + name] as! [String: Any]
  e["props"] = props.map { Double($0) }
  entries["building/" + name] = e
}

/// Язык пламени, кадр i из 6: без обводки, жёлтый внутри, оранжевый снаружи; основание в (0, 0).
func flameFrame(_ i: Int) {
  parts = []; xf = .identity
  gradA = p(0, -60); gradB = p(0, 0)
  let ph = 2 * F.pi * F(i) / 6
  func tongue(_ w: F, _ h: F, _ dx: F, _ sway: F) -> CGPath {
    smooth([p(-w, 0), p(-w * 0.8 + sway * 0.3, -h * 0.4), p(dx + sway, -h), p(w * 0.8 + sway * 0.3, -h * 0.45), p(w, 0), p(0, 4)])
  }
  add([tongue(22, 44 + 6 * sin(ph), 0, 6 * sin(ph))], 0xd8502a, outline: false)
  add([tongue(10, 30 + 4 * sin(ph + 2), -9, 5 * sin(ph + 1.4))], 0xf08a30, outline: false)
  add([tongue(10, 34 + 5 * sin(ph + 4), 8, 5 * sin(ph + 2.8))], 0xf08a30, outline: false)
  add([tongue(9, 20 + 4 * sin(ph + 1), 0, 3 * sin(ph + 2))], 0xffd060, outline: false)
}

// ---------- площадка для тренировок: беговой круг, мишень для копья, чучела для топора, стойка с копьями ----------

let TR_R: F = 190
/// Точки совпадают с doTrain в units.ts (там — в единицах мира, здесь ×2).
let TR_TARGET = p(-144, -44), TR_DUMMIES = [p(110, -36), p(150, 16)], TR_RACK = p(0, -8)
let TR_RIBBON = TR_RACK + p(34, -108)

func training(_ stage: Int) {
  // 0 — готовая, 1–3 — этапы стройки (брёвна и разметка → столбы → мишень и руки чучел)
  parts = []
  xf = .identity
  gradA = p(-200, -200); gradB = p(200, 60)
  curLayer = 0
  add([ellipse(p(0, 0), TR_R, TR_R * DEPTH_K)], 0x5c4a32, outline: false)
  // беговой круг — вытоптанная полоса
  mark((0...48).map { p(cos(F($0) / 48 * 2 * .pi) * 168, sin(F($0) / 48 * 2 * .pi) * 68 - 8) }, 0x86704a, 24)
  /// Мишень: стойка-тренога и круг из соломы со шкурой.
  func target(_ c: CGPoint, face: Bool) {
    part([capsule(c + p(-18, 0), c + p(-6, -78), 4, 3.5), capsule(c + p(18, 0), c + p(6, -78), 4, 3.5)], LOG)
    if !face { return }
    let m = c + p(0, -62)
    part([ellipse(m, 28, 30)], 0xc9a46c)
    add([ellipse(m, 18, 19)], HIDE, outline: false)
    add([ellipse(m, 7, 7.5)], 0x8a3a24, outline: false)
    // торчит воткнутое копьё
    part([capsule(m + p(4, 2), m + p(46, -10), 2.4, 2.2)], WOOD)
  }
  /// Чучело: столб, руки-перекладина, туловище, обмотанное шкурой, голова-пучок соломы.
  func dummy(_ c: CGPoint, arms: Bool, body: Bool) {
    part([capsule(c, c + p(0, -98), 6, 5)], LOG)
    if arms { part([capsule(c + p(-30, -70), c + p(30, -74), 4.5, 4.5)], shade(LOG, 0.9)) }
    if body {
      part([smooth([c + p(-17, -36), c + p(-19, -64), c + p(-10, -80), c + p(10, -80), c + p(19, -64), c + p(17, -36), c + p(0, -30)])], HIDE)
      mark([c + p(-17, -50), c + p(17, -54)], shade(HIDE, 0.75), 3)
      part([ellipse(c + p(0, -94), 13, 12)], 0xc9a46c)
    }
  }
  /// Стойка: два столба, перекладина, прислонённые копья.
  func rack(_ c: CGPoint, spears: Bool) {
    if spears {
      for x in [F(-26), -10, 8] {
        let a = c + p(x - 6, 2), b = c + p(x + 8, -88)
        part([capsule(a, b, 2.6, 2.4)], WOOD)
        let d = b - a, u = d * (1 / hypot(d.x, d.y)), n = p(-u.y, u.x)
        part([smooth([b + n * 5.5, b + u * 16, b - n * 5.5, b - u * 4])], STONE_B)
      }
    }
    for x in [F(-34), 34] { part([capsule(c + p(x, 0), c + p(x, -62), 5, 4.5)], LOG) }
    part([capsule(c + p(-40, -56), c + p(40, -58), 4.5, 4.5)], LOG)
    if spears { part([capsule(c + p(34, -60), TR_RIBBON, 3, 2.6)], LOG) }
  }
  if stage == 1 {
    logEnds(p(-60, 36), [3, 2], 12)
    part([capsule(p(40, 40), p(150, 30), 7, 6)], LOG)
    part([capsule(p(60, 58), p(156, 50), 7, 6)], shade(LOG, 0.92))
    return
  }
  curLayer = 1
  target(TR_TARGET, face: stage != 2)
  curLayer = 2
  dummy(TR_DUMMIES[0], arms: stage != 2, body: stage == 0 || stage == 3)
  curLayer = 3
  rack(TR_RACK, spears: stage == 0)
  curLayer = 4
  dummy(TR_DUMMIES[1], arms: stage != 2, body: stage == 0)
  if stage == 2 { part([capsule(p(-80, 50), p(-10, 44), 13, 12)], HIDE) }
  curLayer = 0
}

// ---------- ратуша: купол из шкур с дымовым отверстием, вход между бивнями мамонта ----------

/// Точка на куполе-полусфере радиуса R: t — высота (0 у земли, π/2 — макушка), φ — поворот от нас.
let DOME_R: F = 150, DOME_C = p(0, -DOME_R * DEPTH_K)
func dome(_ t: F, _ phi: F, _ r: F = DOME_R) -> CGPoint {
  let x = r * cos(t) * sin(phi), d = r * cos(t) * cos(phi), z = r * sin(t)
  return DOME_C + p(x, DEPTH_K * d - HEIGHT_K * z)
}

func tusk(_ base: CGPoint, _ ctrl: CGPoint, _ tip: CGPoint) {
  var l: [CGPoint] = [], r: [CGPoint] = []
  for i in 0...14 {
    let t = F(i) / 14, a = base * ((1 - t) * (1 - t)) + ctrl * (2 * (1 - t) * t) + tip * (t * t)
    let d = (ctrl - base) * (2 * (1 - t)) + (tip - ctrl) * (2 * t), n = p(-d.y, d.x) * (1 / hypot(d.x, d.y))
    let w = 13 * (1 - t) + 2.5 * t
    l.append(a + n * w); r.append(a - n * w)
  }
  part([smooth(l + r.reversed())], IVORY)
}

let TH_FLAG = p(150, -320)

func townhall() {
  parts = []
  xf = .identity
  gradA = p(-200, -340); gradB = p(200, 0)
  let flagTop = TH_FLAG
  // флагшток стоит за куполом справа
  part([capsule(p(150, -40), flagTop, 5, 4)], LOG)
  // контур купола: сверху — окружность, снизу — ближний край основания
  var outline: [CGPoint] = []
  for i in 0...24 { let a = F.pi + F.pi * F(i) / 24; outline.append(DOME_C + p(cos(a), sin(a)) * DOME_R) }
  for i in 1..<24 { let a = F.pi * F(i) / 24; outline.append(DOME_C + p(cos(a) * DOME_R, sin(a) * DOME_R * DEPTH_K)) }
  outline.reverse()
  parts.append(Part(paths: [smooth(outline)], color: HIDE, halo: true, rad: (p(-55, -200), 290)))
  // швы между шкурами — меридианы к дымовому отверстию
  for phi in [F(-1.25), -0.75, 0.75, 1.25] {
    mark((0...10).map { dome(F($0) / 10 * 1.35, phi) }, shade(HIDE, 0.78), 3)
  }
  mark((0...16).map { dome(0.55, -1.5 + 3 * F($0) / 16) }, shade(HIDE, 0.82), 2.5)
  // дымовое отверстие и жерди
  let top = dome(.pi / 2, 0)
  for (dx, h) in [(F(-22), F(-58)), (F(20), F(-62)), (F(2), F(-70))] { part([capsule(top + p(dx * 0.3, 2), top + p(dx, h), 4.5, 3.5)], LOG) }
  part([ellipse(top, 30, 30 * DEPTH_K)], shade(HIDE, 0.85))
  add([ellipse(top + p(0, 1), 21, 21 * DEPTH_K)], DARK, outline: false)
  // вход: тёмный проём в куполе
  var door: [CGPoint] = []
  for i in 0...6 { door.append(dome(0.5 * F(i) / 6, 0.24)) }
  for i in 1..<8 { let a = F(i) / 8; door.append(dome(0.5 + 0.12 * sin(a * .pi), 0.24 - 0.48 * a)) }
  for i in 0...6 { door.append(dome(0.5 * (1 - F(i) / 6), -0.24)) }
  part([smooth(door + [p(0, 4)])], DARK)
  tusk(dome(0, 0.42) + p(0, 2), dome(0.35, 0.62) + p(10, -30), dome(0.78, 0.04))
  tusk(dome(0, -0.42) + p(0, 2), dome(0.35, -0.62) + p(-10, -30), dome(0.78, -0.04))
  // черепок с рогами над входом
  let sk = dome(0.72, 0)
  part([capsule(sk + p(-10, -4), sk + p(-28, -22), 4, 2.5), capsule(sk + p(10, -4), sk + p(28, -22), 4, 2.5)], IVORY)
  part([ellipse(sk, 17, 14), ellipse(sk + p(0, 12), 9, 7)], IVORY)
  for x in [F(-7), 7] { add([ellipse(sk + p(x, -2), 4, 4.5)], DARK, outline: false) }
  bone(dome(0, 1.0) + p(-14, 6), dome(0, 0.75) + p(-8, 12), 4)
  bone(dome(0, -0.78) + p(6, 12), dome(0, -1.05) + p(16, 4), 4)
}

haloW = OLW * 2
haloA = 1
var entries: [String: Any] = [:]
/// flame — где горит огонь (в игре там анимированный building/flame).
/// flag — какой флажок и где верхушка шеста (в игре туда ставится анимированный флажок цвета племени).
func put(_ name: String, _ w: Int, _ h: Int, _ ax: F, _ ay: F, frames: Int = 1, base: (y: F, rx: F, ry: F)? = nil, flag: (String, CGPoint)? = nil, flame: CGPoint? = nil, _ draw: @escaping (Int) -> Void) {
  _ = strip("building/" + name, frames, w, h, ax, ay) { draw($0) }
  var e: [String: Any] = ["file": "building/\(name).png", "frames": frames, "w": w, "h": h, "ax": Double(ax) / Double(w), "ay": Double(ay) / Double(h), "scale": 0.5]
  // в единицах мира: картинки нарисованы в 2 раза крупнее
  if let b = base { e["base"] = [Double(b.y) / 2, Double(b.rx) / 2, Double(b.ry) / 2] }
  if let (k, at) = flag { e["flag"] = [k, Double(at.x) / 2, Double(at.y) / 2] }
  if let f = flame { e["flame"] = [Double(f.x) / 2, Double(f.y) / 2] }
  entries["building/" + name] = e
}
// *-build — полоса из трёх этапов стройки
put("storage", 340, 330, 170, 316, base: STORAGE_BASE, flag: ("flag", ST_POLE)) { _ in storage(0) }
put("storage-build", 340, 330, 170, 316, frames: 3) { storage($0 + 1) }
put("hut", 300, 360, 150, 344, base: (HUT_C.y, HUT_R, HUT_R * DEPTH_K), flag: ("ribbon", HUT_RIBBON)) { _ in hut(0) }
put("hut-build", 300, 360, 150, 344, frames: 3) { hut($0 + 1) }
put("forge", 340, 330, 170, 316, base: (FG_C.y, FG_R, FG_R * DEPTH_K), flag: ("ribbon", FG_POLE)) { _ in forge(0) }
put("forge-build", 340, 330, 170, 316, frames: 3) { forge($0 + 1) }
put("kitchen", 420, 340, 210, 236, base: (0, KT_R * KT_K, KT_R * KT_K * DEPTH_K), flag: ("ribbon", KT_RIBBON), flame: p(0, -2)) { _ in kitchen(0) }
put("kitchen-build", 420, 340, 210, 236, frames: 3) { kitchen($0 + 1) }
// заслон, задние скамьи, очаг с вертелом, боковые скамьи, горшок и дрова спереди
layered("kitchen", 420, 340, 210, 236, props: [-36, -28, 0, -6, 22]) { _ in kitchen(0) }
put("training", 440, 300, 220, 200, base: (0, TR_R, TR_R * DEPTH_K), flag: ("ribbon", TR_RIBBON)) { _ in training(0) }
put("training-build", 440, 300, 220, 200, frames: 3) { training($0 + 1) }
// мишень, чучело, стойка, чучело — y их оснований (TR_* / 2)
layered("training", 440, 300, 220, 200, props: [-22, -18, -4, 8]) { _ in training(0) }
put("flame", 64, 72, 32, 64, frames: 6) { flameFrame($0) }
put("townhall", 460, 370, 220, 350, base: (DOME_C.y, DOME_R, DOME_R * DEPTH_K), flag: ("flag", TH_FLAG)) { _ in townhall() }
// флажок и ленточка: 8 кадров волны; *-color — только полотнище, в игре его красят в цвет племени
put("flag", 72, 52, 6, 10, frames: 8) { flagFrame($0, colorOnly: false) }
put("flag-color", 72, 52, 6, 10, frames: 8) { flagFrame($0, colorOnly: true) }
put("ribbon", 50, 34, 6, 12, frames: 8) { ribbonFrame($0, colorOnly: false) }
put("ribbon-color", 50, 34, 6, 12, frames: 8) { ribbonFrame($0, colorOnly: true) }
// дым из трубы кузницы — в игре от этой точки
print("кузница, труба:", fgAt(FG_CHIMNEY.x, FG_CHIMNEY.z, FG_CHIMNEY.h1) * 0.5)

// облачко пыли и дыма над стройкой: мягкое, без обводки, светлее слева сверху
func puff() {
  let size = 96, ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  for (x, y, r, c) in [(F(48), F(44), F(30), UInt32(0xb8ac98)), (F(34), F(52), F(22), 0xcfc4b0), (F(60), F(54), F(22), 0xc6baa6), (F(46), F(58), F(24), 0xd8cdb8)] {
    let g = CGGradient(colorsSpace: space, colors: [hex(c, 0.85), hex(c, 0.55), hex(c, 0)] as CFArray, locations: [0, 0.55, 1])!
    ctx.drawRadialGradient(g, startCenter: p(x, y), startRadius: 0, endCenter: p(x, y), endRadius: r, options: [])
  }
  let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: ASSETS + "/item/puff.png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, ctx.makeImage()!, nil)
  CGImageDestinationFinalize(dst)
  entries["item/puff"] = ["file": "item/puff.png", "frames": 1, "w": size, "h": size, "ax": 0.5, "ay": 0.5, "scale": 0.5]
}
puff()
saveManifest(entries)
