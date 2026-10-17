// swift-tools-version:5.9
import PackageDescription

// The DeepARAM macOS app. `scripts/build-app.sh` turns the executable into DeepARAM.app.
let package = Package(
    name: "DeepARAM",
    platforms: [.macOS(.v14)],
    dependencies: [.package(path: "../shared/DeepARAMKit")],
    targets: [
        .executableTarget(
            name: "DeepARAM",
            dependencies: [.product(name: "DeepARAMKit", package: "DeepARAMKit")]
        ),
    ]
)
