# 세컨플래닝 리팩토링

단일 HTML 프로토타입(`legacy/index.original.html`, 퇴직준비도 진단)을 **계산 결과와 디자인을 바꾸지 않고** 유지보수하기 쉬운 구조로 옮기는 작업 저장소다. 기준 파일(`legacy/`)은 정답 기준이라 수정하지 않는다. 작업은 `src/`에서만 한다.

## 비공개 저장소
내부 프로토타입과 의사결정 문서를 담고 있으므로 **비공개로 유지한다.** 공개하기 전에는 민감 정보(계정·연락처·고객사 이름 등) 점검이 필요하다. 이 저장소의 사용자 데이터는 모두 가상 데이터(데모 시드)다.

## 시작하기
Node 버전은 `.nvmrc`를 따른다(24).
```powershell
npm ci
npx playwright install chromium    # 한 번만
npm run test:dist                  # 빌드 → preview → 전체 테스트 (기대: 108건 통과, 2건 건너뜀)
```
- 개발 서버: `npm run dev` / 빌드: `npm run build` / 미리보기: `npm run preview`
- 기준 파일(legacy) 대상 확인: `npm test`
- 그 밖의 명령과 사용법은 `AGENTS.md`의 "테스트 실행"에 있다.

## 문서 위치
| 문서 | 내용 |
|---|---|
| `AGENTS.md` | 작업 규칙(절대 규칙, 단계, 테스트 실행). 도구와 상관없이 가장 먼저 읽는다. `CLAUDE.md`는 이 파일을 가져오기만 한다 |
| `docs/단계3b-지시서.md` | 지금 상태, 남은 계획, 다음 단계 요구사항, 첫 세션 프롬프트 |
| `docs/decisions.md` | 결정 기록, 미결정 항목, 보존 중인 특이점, 리팩토링 후 별도 판단 목록 |
| `docs/문구-변경-절차.md` | 코멘트·키워드 문구를 바꾸는 절차(기획자 주의 포함) |
| `docs/단계3a-결과.md`, `docs/단계3a0-프로브-결과.md`, `docs/단계3-전역-핸들러-조사.md` | 단계 3 준비 조사와 결과 |
| `docs/변조-시험-최소-실행기.md` | 최소 변조 시험 6건 |

## 로컬에만 있는 것
- `tests/snapshot/baseline/img/` — 캡처 기준 이미지(저장소에 올리지 않음, 이 PC의 글꼴에 묶여 있음). 새 PC에서는 `npm run visual:update`로 legacy에서 다시 만든 뒤 `npm run test:dist -- --visual`로 비교한다.
- `node_modules/`, `dist/`, `test-results/` — 재생성 가능(`npm ci`, `npm run build`).
- 단계 태그는 `step-1a` … `step-3a`다(`git tag -l "step-*"`).
