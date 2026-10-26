# 단계 1b 치환 지점과 실행 테스트

`src/index.html`·`src/js/*` 기준 줄 번호. 실행 테스트는 V8 블록 커버리지(`COV_OUT`)로 측정했다. **실행됨은 단언됨과 다르다**(그 지점의 값이 정답표·스냅샷에 반영되는지는 별도).

| ID | 파일:줄 | 바꾸기 전 | 바꾼 후 | 설명 | 실행하는 테스트 |
|---|---|---|---|---|---|
| S01 | src/js/04-util.js:7 | `[0,1,2,3,4].map(i=>Math.round(((sum(a.slice(i*3,i*3+3))/3-1)/4*100)*10)/10)` | `AREA_IDX.map(i=>toScore(sum(a.slice(i*ITEMS_PER_AREA,(i+1…` | areaScores 환산 | 골든 1건 · 스냅샷 36건(c-edit-review, a-tab-ver, res-p-hong …) · e2e 2건(2,4단계) |
| S02 | src/js/05-engine.js:20 | `[0,1,2,3,4].map(i=>sum(a.slice(i*3,i*3+3)))` | `AREA_IDX.map(i=>sum(a.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_…` | rawSums 영역 합계 | 골든 1건 · 스냅샷 36건(c-edit-review, a-tab-ver, res-p-hong …) · e2e 2건(2,4단계) |
| S03 | src/js/05-engine.js:39 | `a.length===15&&a.every(v=>v>=1&&v<=5)` | `a.length===ITEM_COUNT&&a.every(v=>v>=SCALE_MIN&&v<=SCALE_…` | full 응답 완료 판정 | 골든 1건 · 스냅샷 72건(p-login, p-home-draft, p-wizard-1 …) · e2e 7건(1,2,3,4,5,6,7단계) |
| S04-1 | src/index.html:458 | `Array(15)` | `Array(ITEM_COUNT)` | 빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳) | 골든 1건 · 스냅샷 1건(a-tab-ver) · e2e 1건(1단계) |
| S04-2 | src/index.html:563 | `Array(15)` | `Array(ITEM_COUNT)` | 빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳) | e2e 1건(6단계) |
| S04-3 | src/index.html:858 | `Array(15)` | `Array(ITEM_COUNT)` | 빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳) | 스냅샷 1건(p-post-diag) · e2e 1건(6단계) |
| S04-4 | src/index.html:1108 | `Array(15)` | `Array(ITEM_COUNT)` | 빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳) | 골든 1건 · 스냅샷 1건(a-tab-ver) |
| S04-5 | src/index.html:1109 | `Array(15)` | `Array(ITEM_COUNT)` | 빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳) | 골든 1건 · 스냅샷 1건(a-tab-ver) |
| S04-6 | src/index.html:1113 | `Array(15)` | `Array(ITEM_COUNT)` | 빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳) | 골든 1건 · 스냅샷 1건(a-tab-ver) |
| S04-7 | src/index.html:1115 | `Array(15)` | `Array(ITEM_COUNT)` | 빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳) | 골든 1건 · 스냅샷 1건(a-tab-ver) |
| S05-1 | src/index.html:497 | `Array.from({length:15}` | `Array.from({length:ITEM_COUNT}` | 시드 데모 응답 · C_CODES | 골든 1건 · e2e 1건(1단계) |
| S05-2 | src/index.html:657 | `Array.from({length:15}` | `Array.from({length:ITEM_COUNT}` | 시드 데모 응답 · C_CODES | 골든 1건 · 스냅샷 72건(p-login, p-home-draft, p-wizard-1 …) · e2e 5건(1,2,3,4,6단계) |
| S06-1 | src/index.html:799 | `${n} / 15 문항 응답` | `${n} / ${ITEM_COUNT} 문항 응답` | 응답 수 표시 문구(사전 진단 · 사후 진단) | 스냅샷 2건(p-wizard-4, p-wizard-3-missing) · e2e 2건(2,4단계) |
| S06-2 | src/index.html:860 | `${n} / 15 문항 응답` | `${n} / ${ITEM_COUNT} 문항 응답` | 응답 수 표시 문구(사전 진단 · 사후 진단) | 스냅샷 1건(p-post-diag) · e2e 1건(6단계) |
| S07 | src/index.html:860 | `width:${n/15*100}%` | `width:${n/ITEM_COUNT*100}%` | 사후 진단 진행바 폭 | 스냅샷 1건(p-post-diag) · e2e 1건(6단계) |
| S08 | src/index.html:871 | `:15)+'개 있습니다.'` | `:ITEM_COUNT)+'개 있습니다.'` | toSat 미응답 개수 오류 문구 | **미검증** |
| S09 | src/index.html:905 | `[0,33.3,58.3,83.3,100].forEach` | `GRADE_TICKS.forEach` | barsSVG 눈금 | 스냅샷 10건(m-dash-e1, m-dash-e2, res-p-hong …) · e2e 1건(5단계) |
| S10 | src/index.html:950 | `${[0,20,40,60,80,100].map(` | `${BAL_Y_TICKS.map(` | 밸런스 차트 Y축 숫자 | 골든 1건 · 스냅샷 36건(c-edit-review, a-tab-ver, res-p-hong …) · e2e 1건(4단계) |
| S11 | src/index.html:950 | `${[['높음',91],['다소<br>높음',70],['보통',45],['다소<br>낮음',17]].map(` | `${BAL_Y_LEVELS.map(` | 밸런스 차트 Y축 판정 라벨 위치 | 골든 1건 · 스냅샷 36건(c-edit-review, a-tab-ver, res-p-hong …) · e2e 1건(4단계) |
| S12 | src/index.html:1017 | `cv=r=>(Math.round((r-3)*100/12*10)/10).toFixed(1),b=[[3,c[0]],[c[0]+1,c[1]],[c[1]+1,c[2]],[c[2]+1,15]]` | `cv=r=>toScore(r).toFixed(1),b=[[RAW_MIN,c[0]],[c[0]+1,c[1…` | bandCells 평가기준표(상담사용 5쪽) | 골든 1건 · 스냅샷 19건(c-edit-review, a-tab-ver, res-c-hong …) · e2e 1건(4단계) |
| S13 | src/index.html:1093 | `s1[i]+' / '+level(s1[i])` | `s1[i]+' / '+gradeOf(i,rawSums(x1)[i])` | 자체 검증 Result 5행 판정(level 대체) | 골든 1건 · 스냅샷 1건(a-tab-ver) |
| S14 | src/index.html:1101 | `const v=Math.round((r-3)*100/12*10)/10;add('평가기준 C22:E34','원점수 '+r+' ('+v+'점)',labelRaw(r),level(v))` | `const v=toScore(r);add('평가기준 C22:E34','원점수 '+r+' ('+v+'점)…` | 자체 검증 C22:E34 13항목(labelRaw·level 대체) | 골든 1건 · 스냅샷 1건(a-tab-ver) |
| S15 | src/index.html:1100 | `(없음)` | `const C22E34={3:'다소 낮음'` | C22E34 고정 표 정의(신규) | 골든 1건 · 스냅샷 1건(a-tab-ver) |
| S16 | src/index.html:1310 | `sum(arr.slice(i*3,i*3+3))` | `sum(arr.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA))` | rawA 사전사후 영역 원점수 | 스냅샷 6건(c-tab-rep, a-tab-rep, rep-r1 …) · e2e 1건(7단계) |
| S17-1 | src/index.html:1366 | `평균 합계 (75점)` | `평균 합계 (${AREA_COUNT*RAW_MAX}점)` | 사전사후 결과 타일 문구(사전·사후 2곳) | 스냅샷 5건(c-tab-rep, a-tab-rep, rep-r1 …) · e2e 1건(7단계) |
| S17-2 | src/index.html:1366 | `평균 합계 (75점)` | `평균 합계 (${AREA_COUNT*RAW_MAX}점)` | 사전사후 결과 타일 문구(사전·사후 2곳) | 스냅샷 5건(c-tab-rep, a-tab-rep, rep-r1 …) · e2e 1건(7단계) |
| S18 | src/index.html:1367 | `영역별 원점수(15점 만점 기준)` | `영역별 원점수(${RAW_MAX}점 만점 기준)` | 사전사후 결과 안내 문구 | 스냅샷 5건(c-tab-rep, a-tab-rep, rep-r1 …) · e2e 1건(7단계) |
| S19 | src/index.html:1368 | `max:15,step:1,top,pt:50` | `max:RAW_MAX,step:1,top,pt:50` | 사전사후 결과 차트 최대값 | 스냅샷 5건(c-tab-rep, a-tab-rep, rep-r1 …) · e2e 1건(7단계) |
| S20 | src/index.html:1382 | `요인은 5점 평균, 종합은 영역별 원점수(15점 만점) 기준` | `요인은 ${SCALE_MAX}점 평균, 종합은 영역별 원점수(${RAW_MAX}점 만점) 기준` | 사전사후 상세 안내 문구 | 스냅샷 1건(rep-r2) · e2e 1건(7단계) |

## 제거된 함수

| ID | 파일 | 대상 | 비고 |
|---|---|---|---|
| R1 | src/js/04-util.js | function level(v){…} | 자체 검증 2곳이 gradeOf 로 대체(S13·S14). 골든 conversion 은 필드 제거. |
| R2 | src/js/05-engine.js | const labelRaw=… | 자체 검증 C22E34 표로 대체(S14). |

## 미검증

- S08 (src/index.html:871) toSat 미응답 개수 오류 문구
