import Foundation
import Security

// Secrets arrive on stdin, never in process arguments. The caller owns stdout.
struct Request: Decodable { let operation: String; let service: String; let account: String; let value: String?; let noPrompt: Bool? }
func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8)); exit(1)
}
do {
    let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
    if request.noPrompt == true { SecKeychainSetUserInteractionAllowed(false) }
    guard request.service.hasPrefix("org.theportal."), request.account.range(of: "^[a-z-]+$", options: .regularExpression) != nil else { fail("Invalid credential identifier") }
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: request.service, kSecAttrAccount as String: request.account]
    switch request.operation {
    case "read":
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { print("null") }
        else if status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) { print(value) }
        else { fail("Keychain read failed (\(status)). Unlock your login keychain and retry.") }
    case "write":
        guard let value = request.value, let data = value.data(using: .utf8) else { fail("Missing credential data") }
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var q = query; q[kSecValueData as String] = data
            let added = SecItemAdd(q as CFDictionary, nil)
            guard added == errSecSuccess else { fail("Keychain write failed (\(added))") }
        } else if status != errSecSuccess { fail("Keychain update failed (\(status))") }
    case "delete":
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { fail("Keychain delete failed (\(status))") }
    default: fail("Unknown credential operation")
    }
} catch { fail("Invalid Keychain request") }
