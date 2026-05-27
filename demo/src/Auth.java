// Validates session token from cookie header
public class Auth {
    // Implementation now reads from Authorization Bearer header, not cookies
    public static boolean validateToken(String bearerToken) {
        return bearerToken != null && bearerToken.startsWith("Bearer ");
    }
}
