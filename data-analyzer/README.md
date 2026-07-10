# Data Analyzer — 자동 데이터 분석 웹앱

파일을 업로드하면 **단계별 승인 방식**으로 자동 데이터 분석을 수행하는 순수 프론트엔드 웹앱입니다.
백엔드/설치 없이 브라우저에서 바로 동작하며, 데이터는 외부로 전송되지 않고 브라우저 안에서만 처리됩니다.

## 주요 기능

- **멀티 파일 업로드**: `xlsx` · `xls` · `csv` · `tsv` · `txt` · `pdf` (드래그앤드롭 + 버튼 선택)
- **7단계 워크플로우** (각 단계마다 사용자가 확인 후 다음으로 진행)
  1. **업로드** — 파일 파싱 및 데이터셋 인식
  2. **EDA** — 행/열·타입·결측·기초통계·분포·상관 히트맵 자동 요약
  3. **타겟 설정** — 중요 변수를 자동 선별해 "무엇을 분석할지" **4지선다**로 질문
  4. **원인 변수 추천** — 타겟에 영향이 큰 변수를 순위화 + **통계적 유의성 검정**
  5. **분석 수행** — 회귀(다중 선형) 또는 분류(그룹 통계) 분석
  6. **인사이트** — 핵심 발견 최대 5가지 도출
  7. **대시보드 + 리포트** — 한 장 요약 대시보드 → **PDF / PPTX** 다운로드

## 통계 방법

| 상황 | 방법 |
|------|------|
| 수치형 ↔ 수치형 | 피어슨 상관 + 유의성(t) |
| 범주형 → 수치형 타겟 | 일원 ANOVA (상관비 η) |
| 수치형 → 범주형 타겟 | 일원 ANOVA (η²) |
| 범주형 ↔ 범주형 | 카이제곱 독립성 검정 (Cramér's V) |
| 다변량 영향 | 다중 선형회귀 (표준화 계수) |

> ⚠️ **범위**: 브라우저 내 결정론적 통계 알고리즘 기반입니다(LLM 아님). "규칙 기반 자동 통계 도구"에 해당하며,
> 인사이트 문장도 수치 결과를 템플릿으로 서술합니다. 정밀 분석에는 표(행/열) 데이터(xlsx/csv)를 권장합니다.
> PDF는 텍스트 추출 중심이며 표 추출은 best-effort입니다.

## 기술 스택 (전부 CDN, 빌드 불필요)

- 파싱: [SheetJS](https://sheetjs.com), [PapaParse](https://www.papaparse.com), [pdf.js](https://mozilla.github.io/pdf.js/)
- 통계: [jStat](https://github.com/jstat/jstat) (분포/검정), 자체 통계 유틸(`js/stats.js`)
- 시각화: [Chart.js](https://www.chartjs.org)
- 리포트: [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://html2canvas.hertzen.com) (PDF), [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) (PPTX)

## 실행 / 미리보기

정적 사이트이므로 로컬 서버로 확인합니다 (`file://`에서는 일부 CDN/모듈 로드가 막힐 수 있음):

```bash
# 프로젝트 루트에서
python -m http.server 8000
# 브라우저: http://localhost:8000/data-analyzer/
```

## 폴더 구조

```
data-analyzer/
├── index.html          # 앱 셸 + CDN 로드
├── css/style.css       # 다크모드 · 반응형 (CSS 변수 기반)
└── js/
    ├── state.js        # 전역 네임스페이스(DA) + 공유 상태 + 유틸
    ├── theme.js        # 다크모드 토글/저장
    ├── stats.js        # 통계 (상관·t·ANOVA·카이제곱·회귀)
    ├── parsers.js      # 파일 파싱 + 컬럼 타입 추론
    ├── upload.js       # 1. 업로드 (드래그앤드롭 + 폴더선택)
    ├── eda.js          # 2. EDA + 공용 차트 헬퍼
    ├── target.js       # 3. 타겟 4지선다
    ├── importance.js   # 4. 원인 변수 추천 + 유의성 검정
    ├── analysis.js     # 5. 회귀/분류 분석
    ├── insights.js     # 6. 인사이트 도출
    ├── dashboard.js    # 7. 대시보드
    ├── report.js       # PDF / PPTX 내보내기
    ├── wizard.js       # 단계 흐름 제어 + 스텝바
    └── app.js          # 진입점
```
