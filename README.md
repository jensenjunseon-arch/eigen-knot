# eigen knot — 카드뉴스 자동 생성기

뉴스레터 글 한 편 + 배경 사진 한 장 → 인스타그램 캐러셀용 **1080×1350 PNG 카드 10장**.

코드로 렌더링하고(React) 헤드리스 브라우저로 캡처한다(Playwright). 폰트는 self-host —
캡처 시 CDN에 의존하지 않으므로 한글 두부(□□□)·배경 누락·해상도 깨짐이 구조적으로 없다.

```
글(.md) + 사진 + 메타 ──▶ [Claude] 카드 JSON ──▶ [React] 렌더 ──▶ [Playwright] PNG×10 + ZIP
                              (M3)                   (M1)              (M2)
```

## 설치

```bash
cd eigen-knot
npm install
npx playwright install chromium   # 헤드리스 크로미움 (최초 1회)
```

## 사용법

### 1) AI 초안 → 카드 (M3 + M2)
```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run generate -- \
  --issue 14 --slug delayed-adulthood \
  --title "당신의 20대는 어쩌다 3년짜리가 되었을까" \
  --img ~/photos/issue14.jpg \
  --body ~/drafts/issue14.md \
  --model sonnet            # 또는 opus
```

### 2) 수동/편집한 콘텐츠 → 카드 (AI 없이, M2만)
LLM 출력은 **초안**이다. `output/issue-XXX/deck.json`의 `content`를 꺼내 다듬은 뒤:
```bash
npm run generate -- --no-ai \
  --deck content.json \
  --img ~/photos/issue14.jpg \
  --issue 14 --slug delayed-adulthood --title "…" \
  --focal "center 35%"      # 사진별 구도 (PRD §11.5)
```

### 3) 샘플 (네트워크/키 불필요)
```bash
npm run sample        # 14호(delayed-adulthood)를 플레이스홀더 배경으로 캡처
```

### 4) 미리보기 (브라우저에서 10장 한눈에 + 오버플로 경고)
```bash
npm run dev           # http://localhost:5173  — 스케일된 10장 그리드
```

## 옵션
| 플래그 | 설명 |
|---|---|
| `--issue` `--slug` `--title` | 호 메타. slug은 파일명에 쓰이므로 영문 kebab. |
| `--img` | 배경 사진(jpg/png/svg). dataURL로 인라인됨. |
| `--body` | 뉴스레터 본문(.md/.txt) — AI 모드. |
| `--deck` | 콘텐츠 JSON(`DeckContent`) — `--no-ai`와 함께. |
| `--focal` | `background-position` (예: `"center 30%"`). 기본 `center`. |
| `--dim` | 본문 카드 dim 일괄값(예: `0.9`). cover/closing은 밝게 유지. |
| `--scale` | `deviceScaleFactor`. 1=정확히 1080×1350(기본), 2=레티나 2배. |
| `--model` | `sonnet`(기본) `opus` `haiku`. |
| `--build` | 컴포넌트 코드를 고쳤을 때 강제 재빌드. |

## 출력
`output/issue-XXX/`:
- `01-…-cover.png` … `10-…-closing.png` (순번 정렬)
- `eigen-knot-weekly-issue-insight-{slug}-knot-{NNN}.zip`
- `deck.json` (재캡처/이력용 — PRD §11.10)

파일명 규칙: `{NN}-eigen-knot-weekly-issue-insight-{slug}-knot-{NNN}-{cardname}.png`

## 10장 구조 (내러티브 아크)
cover → summary(3줄) → definition → **two-stories(★대비)** → diagnosis → analysis → grid → claim → conclusion(대구) → closing(고정).
04 대비 카드가 시그니처: 평행한 두 장면 + 둘을 꿰는 한 줄.

## 디자인 시스템 (요약)
- 컬러: ink 사진 위 `white`/`whiteFaint` **2단계만** + `wine`(결정적 한 줄, 덱 전체 ≤5회) + `chartreuse`(브랜드 자기참조, closing 1회).
- 폰트: 한글 `Noto Serif KR`(명조), 영문 킥커/워터마크 `Cormorant Garamond` italic. 둘 다 self-host.
- 캔버스 1080×1350, 안전영역 top 180/200 · left 120 · right 140. 워터마크는 안쪽 대각(bottom 180, right 120), 한 줄 고정.
- dim 리듬: 밝게 시작(0.62) → 본문 깊게(0.90) → 밝게 마무리(0.62).

세부 토큰은 `src/design/tokens.ts`, 카드 레이아웃은 `src/cards/cards.tsx`.

## 사람이 개입하는 지점 (중요)
완전 자동화하면 품질이 떨어진다. AI는 초안만 만든다. 사람이:
- 04 대비 카드가 제대로 잡혔는지 / 결론이 04 전에 새지 않았는지
- 카드별 문구 길이(미리보기의 ⚠ 오버플로 경고)
- 사진별 `--focal`, `--dim`
- 강조 위치
를 검수·조정한 뒤 `--no-ai --deck`로 다시 렌더한다.

## 안티패턴 (PRD §10·§11에서 배운 것 — 이미 반영됨)
- ❌ 브라우저 DOM-to-image(html-to-image) 다중 캡처 → 배경 랜덤 누락. **→ Playwright 네이티브 캡처.**
- ❌ 캡처 시 CDN 폰트 의존 → 두부/리플로. **→ @fontsource self-host + `document.fonts.ready`/`load` 게이트.**
- ❌ 스케일된 미리보기를 캡처 → 924×540 버그. **→ 네이티브 1080×1350 페이지를 따로 캡처.**
- ❌ 한글 `word-break: keep-all` 누락 → 단어 중간 쪼개짐. **→ `.ek-ko` 전역.**
- ❌ 워터마크 줄바꿈 / 강조색 남발 / 본문 30px 미만. **→ nowrap / wine ≤5 / 본문 ≥30px.**

## 마일스톤
- ✅ **M1** 렌더 엔진(디자인 시스템 + 10 템플릿 + 미리보기)
- ✅ **M2** Playwright 캡처(정확한 1080×1350, 폰트/배경 게이트, ZIP)
- ✅ **M3** Claude 본문→카드 JSON(forced tool-use)
- ⬜ **M4** 인라인 편집 UI(카드별 문구 수정·dim 슬라이더·강조 토글)
- ⬜ **M5** 호별 프로젝트 저장/이력·템플릿 재사용

## 구조
```
src/design/   tokens.ts · fonts.ts · base.css
src/types.ts  DeckContent 스키마 + CARD_ORDER(순서·dim·top·cardname)
src/cards/    CardBase.tsx · cards.tsx(10장 + RenderCard)
src/preview/  App.tsx(grid + capture 모드) · main.tsx
src/sample/   issue-14.json · issue-14-bg.svg
content/      analyze.mjs (Claude)
capture/      capture.mjs (Playwright)
scripts/      generate.mjs (CLI) · shared.mjs
```
