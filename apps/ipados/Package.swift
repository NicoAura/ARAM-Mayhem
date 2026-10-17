// swift-tools-version:5.9
import PackageDescription

// The iPad layout of the DeepARAM app: a sidebar of sections and a champion pane beside the page.
// The DeepARAM app in apps/ios shows it on iPad; it builds on the shared DeepARAMKit package.
let package = Package(
    name: "DeepARAMPad",
    platforms: [.iOS(.v17)],
    products: [.library(name: "DeepARAMPad", targets: ["DeepARAMPad"])],
    dependencies: [.package(path: "../shared/DeepARAMKit")],
    targets: [
        .target(name: "DeepARAMPad", dependencies: ["DeepARAMKit"]),
    ]
)
