// swift-tools-version:5.9
import PackageDescription

// Code shared by the DeepARAM macOS, iOS and iPadOS apps: the site's sections, which links stay
// in the app, and the patch check behind the "new patch" notifications.
let package = Package(
    name: "DeepARAMKit",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "DeepARAMKit", targets: ["DeepARAMKit"])],
    targets: [
        .target(name: "DeepARAMKit"),
        .testTarget(name: "DeepARAMKitTests", dependencies: ["DeepARAMKit"]),
    ]
)
