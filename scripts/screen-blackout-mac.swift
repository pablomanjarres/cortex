import AppKit
import CoreGraphics
import Foundation

// Umbra remains the owner of saved gamma tables and display recovery.
func displayState() throws -> (black: Int, total: Int) {
    var count: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &count) == .success, count > 0 else {
        throw ControlError.failed("No active displays")
    }
    var displays = [CGDirectDisplayID](repeating: 0, count: Int(count))
    guard CGGetActiveDisplayList(count, &displays, &count) == .success else {
        throw ControlError.failed("Could not read active displays")
    }
    var black = 0
    for display in displays.prefix(Int(count)) {
        let capacity = CGDisplayGammaTableCapacity(display)
        guard capacity > 0 else { throw ControlError.failed("Display state unavailable") }
        var red = [CGGammaValue](repeating: 0, count: Int(capacity))
        var green = red, blue = red
        var samples: UInt32 = 0
        guard CGGetDisplayTransferByTable(display, capacity, &red, &green, &blue, &samples) == .success,
              samples > 0 else { throw ControlError.failed("Could not read display state") }
        let n = Int(samples)
        if red.prefix(n).allSatisfy({ $0 == 0 }) && green.prefix(n).allSatisfy({ $0 == 0 }) && blue.prefix(n).allSatisfy({ $0 == 0 }) { black += 1 }
    }
    return (black, Int(count))
}

enum ControlError: Error { case failed(String) }
do {
    let action = CommandLine.arguments.dropFirst().first ?? "status"
    guard ["status", "on", "off"].contains(action) else { throw ControlError.failed("Invalid screen action") }
    guard NSRunningApplication.runningApplications(withBundleIdentifier: "io.github.frapsd.Umbra")
        .contains(where: { $0.bundleURL?.standardizedFileURL.path == "/Applications/Umbra.app" }) else {
        throw ControlError.failed("Open Umbra on the Mac to control its screens")
    }
    var state = try displayState()
    if action != "status" {
        let desired = action == "on"
        if desired && state.black > 0 && state.black < state.total {
            throw ControlError.failed("Some displays are black; restore screens before enabling blackout")
        }
        // Restore is unconditional and idempotent. Toggle is used only after a
        // native read proves all screens are lit; uncertain commands are never retried.
        if !desired || state.black == 0 {
            let name = desired ? "io.github.frapsd.Umbra.toggle" : "io.github.frapsd.Umbra.restore"
            DistributedNotificationCenter.default().postNotificationName(Notification.Name(name), object: nil, userInfo: nil, deliverImmediately: true)
        }
        let deadline = Date().addingTimeInterval(5)
        repeat {
            Thread.sleep(forTimeInterval: 0.1)
            state = try displayState()
            if desired ? state.black == state.total : state.black == 0 { break }
        } while Date() < deadline
        guard desired ? state.black == state.total : state.black == 0 else {
            throw ControlError.failed("Umbra did not confirm the requested screen state; refresh before retrying")
        }
    }
    let data = try JSONSerialization.data(withJSONObject: ["enabled": state.black > 0, "monitorCount": state.total])
    print(String(decoding: data, as: UTF8.self))
} catch {
    let message: String
    if case ControlError.failed(let detail) = error { message = detail } else { message = error.localizedDescription }
    let data = try! JSONSerialization.data(withJSONObject: ["error": message])
    print(String(decoding: data, as: UTF8.self))
    exit(1)
}
