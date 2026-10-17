import XCTest
@testable import DeepARAMKit

final class DeepARAMKitTests: XCTestCase {
    func testPatchOrderIsNumeric() {
        XCTAssertEqual(PatchWatcher.compare("16.10", "16.9"), 1)
        XCTAssertEqual(PatchWatcher.compare("16.9", "16.9"), 0)
        XCTAssertEqual(PatchWatcher.compare("15.24", "16.1"), -1)
    }

    func testPatchesFromSitemap() {
        let xml = "<loc>https://deeparam.com/patches</loc><loc>https://deeparam.com/patches/16.9</loc><loc>https://deeparam.com/patches/16.20</loc>"
        XCTAssertEqual(PatchWatcher.patches(inSitemap: xml), ["16.20", "16.9"])
    }

    func testInternalLinks() {
        XCTAssertTrue(Site.isInternal(URL(string: "https://deeparam.com/pbe")!))
        XCTAssertTrue(Site.isInternal(URL(string: "https://www.deeparam.com/")!))
        XCTAssertFalse(Site.isInternal(URL(string: "https://ko-fi.com/x")!))
    }

    func testOfflineFileNamesDiffer() {
        let s = OfflineStore(folder: URL(fileURLWithPath: "/tmp"))
        XCTAssertNotEqual(s.fileURL(for: Site.url("/")), s.fileURL(for: Site.url("/pbe")))
    }
}
