# Language Detection

## First Step - Language Check

**IMPORTANT**: Before evaluating, check if the AGENTS.md content is written in **English**.

- If the content is **NOT in English** (e.g., Chinese, Japanese, Spanish, French, etc.), immediately return an empty JSON array: `[]`
- Only proceed with evaluation if the content is primarily in English

## Non-English Indicators

Check for these indicators that content is NOT in English:

| Language | Indicators |
|----------|------------|
| **Chinese** | Characters like 中文, 项目, 安装, 测试, 配置 |
| **Japanese** | Characters like プロジェクト, インストール, テスト, 設定 |
| **Korean** | Characters like 프로젝트, 설치, 테스트, 설정 |
| **Spanish** | Unique patterns like "instalación", "pruebas", "configuración" |
| **French** | Patterns like "installation", "essais", "configuration" |
| **German** | Patterns like "Installation", "Prüfung", "Konfiguration" |
| **Russian** | Cyrillic characters like проект, установка, тест |

## Decision Rule

If you detect predominantly non-English content (>50% of substantive text), return `[]` and stop evaluation immediately.
