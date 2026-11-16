// 批量读取照片 EXIF GPS，并用 macOS Vision 识别二维码。
//
// 用法：
//   swiftc -O tools/qr-gps.swift -o /tmp/qr-gps
//   /tmp/qr-gps ~/Downloads/IMG_*.HEIC > /tmp/piles.json
//
// 输出：JSON 数组，每项包含 file / lat / lon / date / codes。
// 仅支持 macOS（依赖 Vision 与 ImageIO）。

import Foundation
import ImageIO
import Vision

struct Out: Encodable {
    let file: String
    let lat: Double?
    let lon: Double?
    let date: String?
    let codes: [String]
}

var results: [Out] = []

for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    var lat: Double?
    var lon: Double?
    var date: String?
    var codes: [String] = []

    if let src = CGImageSourceCreateWithURL(url as CFURL, nil),
       let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] {
        if let gps = props[kCGImagePropertyGPSDictionary] as? [CFString: Any] {
            lat = gps[kCGImagePropertyGPSLatitude] as? Double
            lon = gps[kCGImagePropertyGPSLongitude] as? Double
            if let ref = gps[kCGImagePropertyGPSLatitudeRef] as? String, ref.uppercased() == "S" {
                lat = -(lat ?? 0)
            }
            if let ref = gps[kCGImagePropertyGPSLongitudeRef] as? String, ref.uppercased() == "W" {
                lon = -(lon ?? 0)
            }
        }
        if let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] {
            date = exif[kCGImagePropertyExifDateTimeOriginal] as? String
        }
        if let img = CGImageSourceCreateImageAtIndex(src, 0, nil) {
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.qr]
            let handler = VNImageRequestHandler(cgImage: img, options: [:])
            try? handler.perform([request])
            for obs in request.results ?? [] {
                if let payload = obs.payloadStringValue {
                    codes.append(payload)
                }
            }
        }
    }

    results.append(Out(file: url.lastPathComponent, lat: lat, lon: lon, date: date, codes: codes))
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
FileHandle.standardOutput.write(try encoder.encode(results))
