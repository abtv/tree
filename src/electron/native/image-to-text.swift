import Foundation
import ImageIO
import Vision

// One image per process. Input and output use pipes; no paths or network resources are accepted.
do {
    var input = Data()
    while input.count <= 25 * 1024 * 1024 {
        let chunk = try FileHandle.standardInput.read(upToCount: min(65536, 25 * 1024 * 1024 + 1 - input.count)) ?? Data()
        if chunk.isEmpty { break }
        input.append(chunk)
    }
    guard !input.isEmpty, input.count <= 25 * 1024 * 1024,
          let source = CGImageSourceCreateWithData(input as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width <= 32767, height <= 32767,
          width * height <= 64_000_000 else {
        throw NSError(domain: "ImageToText", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "The image is invalid or too large."])
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(data: input, options: [:]).perform([request])

    // Infer paragraphs from spacing and text height. Headings and list items start
    // separate nodes; visual line wraps inside a paragraph become ordinary spaces.
    var paragraphs: [String] = []
    var lines: [String] = []
    var previous: CGRect?
    for observation in request.results ?? [] {
        guard let text = observation.topCandidates(1).first?.string,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
        let box = observation.boundingBox
        let bullet = text.range(of: "^[•●▪◦]\\s*", options: .regularExpression)
        if let last = previous {
            let gap = last.minY - box.maxY
            let heightRatio = max(last.height, box.height) / max(min(last.height, box.height), 0.0001)
            if bullet != nil || heightRatio > 1.3 || gap > max(last.height, box.height) * 0.6 || box.minY > last.maxY {
                if !lines.isEmpty { paragraphs.append(lines.joined(separator: " ")) }
                lines = []
                // Preserve one blank row for a large empty area, never one per list item.
                if gap > max(last.height, box.height) * 1.5,
                   let lastParagraph = paragraphs.last, !lastParagraph.isEmpty {
                    paragraphs.append("")
                }
            }
        }
        let content = bullet.map { String(text[$0.upperBound...]) } ?? text
        if !content.isEmpty { lines.append(content) }
        previous = box
    }
    if !lines.isEmpty { paragraphs.append(lines.joined(separator: " ")) }
    let result = try JSONSerialization.data(withJSONObject: paragraphs)
    try FileHandle.standardOutput.write(contentsOf: result)
} catch {
    try? FileHandle.standardError.write(contentsOf: Data(error.localizedDescription.utf8))
    exit(1)
}
