import XCTest
@testable import DeepARAMKit

final class SiteTests: XCTestCase {
    func testInternalLinks() {
        XCTAssertTrue(Site.isInternal(URL(string: "https://deeparam.com/tier-list")!))
        XCTAssertTrue(Site.isInternal(URL(string: "https://www.deeparam.com/")!))
        XCTAssertTrue(Site.isInternal(URL(string: "about:blank")!))
        XCTAssertFalse(Site.isInternal(URL(string: "https://ko-fi.com/x")!))
        XCTAssertFalse(Site.isInternal(URL(string: "mailto:admin@deeparam.com")!))
        XCTAssertFalse(Site.isInternal(URL(string: "https://deeparam.com.evil.example/")!))
    }

    func testSectionLookup() {
        XCTAssertEqual(Site.section(for: Site.url("/"))?.id, "home")
        XCTAssertEqual(Site.section(for: Site.url("/pbe"))?.id, "pbe")
        XCTAssertEqual(Site.section(for: Site.url("/patches/16.20"))?.id, "patches")
        XCTAssertNil(Site.section(for: Site.url("/champions/ahri")))
        XCTAssertNil(Site.section(for: Site.url("/pbe-old")))
    }
}

final class PatchWatcherTests: XCTestCase {
    func testFirstCheckIsSilent() {
        XCTAssertEqual(PatchWatcher.changes(from: nil, to: PatchStatus(livePatch: "16.20", pbeBuild: "16.21.1")), [])
    }

    func testNewLiveAndPbe() {
        let old = PatchStatus(livePatch: "16.20", pbeBuild: "16.21.8289811")
        let new = PatchStatus(livePatch: "16.21", pbeBuild: "16.22.8300000")
        XCTAssertEqual(PatchWatcher.changes(from: old, to: new), [.live("16.21"), .pbe("16.22")])
    }

    func testPbeBuildBumpIsQuiet() {
        let old = PatchStatus(livePatch: "16.20", pbeBuild: "16.21.8289811")
        let new = PatchStatus(livePatch: "16.20", pbeBuild: "16.21.8299999")
        XCTAssertEqual(PatchWatcher.changes(from: old, to: new), [])
    }

    func testVersionOrder() {
        XCTAssertTrue(PatchWatcher.isNewer("16.10", than: "16.9"))
        XCTAssertTrue(PatchWatcher.isNewer("17.1", than: "16.24"))
        XCTAssertFalse(PatchWatcher.isNewer("16.20", than: "16.20"))
        XCTAssertFalse(PatchWatcher.isNewer("16.19", than: "16.20"))
    }

    func testDecodesSiteStatus() throws {
        let json = #"{"livePatch":"16.20","pbeBuild":"16.21.8289811","pbeUpdated":"2026-10-16"}"#
        let s = try JSONDecoder().decode(PatchStatus.self, from: Data(json.utf8))
        XCTAssertEqual(s.pbePatch, "16.21")
    }
}
