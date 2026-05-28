/**
 * 한글 또는 camelCase 문자열을 snake_case로 변환
 * 예: "회원명" -> "회원명", "UserName" -> "user_name"
 */
export function toSnakeCase(str: string): string {
  if (!str) return ''
  // CamelCase -> snake_case
  const result = str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_가-힣]/g, '')
  return result || str.toLowerCase()
}

/**
 * 문자열을 영문 snake_case로 변환 (한글 포함 시 음역)
 * 실제 음역 변환은 AI 서버에서 처리. 여기선 기본 변환만.
 */
export function toEnglishSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}
