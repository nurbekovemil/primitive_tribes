import Foundation; import CoreGraphics; import ImageIO; import UniformTypeIdentifiers
// Превью кадров крупно на зелёном фоне: preview out.png масштаб файл.png:x:ширина ... (полосы друг под другом)
let a = CommandLine.arguments; let k = CGFloat(Double(a[2])!)
var imgs: [(CGImage, Int, Int)] = []
for s in a[3...] { let q = s.split(separator: ":"); let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: String(q[0])) as CFURL, nil)!; let im = CGImageSourceCreateImageAtIndex(src, 0, nil)!; let x = Int(q[1])!, w = Int(q[2])!; imgs.append((im.cropping(to: CGRect(x: x, y: 0, width: min(w, im.width - x), height: im.height))!, w, im.height)) }
let W = Int(CGFloat(imgs.map{$0.1}.max()!) * k), H = Int(CGFloat(imgs.map{$0.2}.reduce(0,+)) * k)
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(srgbRed: 0.45, green: 0.62, blue: 0.3, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
ctx.interpolationQuality = .high
var y = CGFloat(H)
for (im, _, h) in imgs { y -= CGFloat(h) * k; ctx.draw(im, in: CGRect(x: 0, y: y, width: CGFloat(im.width) * k, height: CGFloat(h) * k)) }
let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, UTType.png.identifier as CFString, 1, nil)!; CGImageDestinationAddImage(d, ctx.makeImage()!, nil); CGImageDestinationFinalize(d)
