// CORS 프록시 서버
// 법제처 API CORS 문제 해결을 위한 간단한 프록시 서버

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정
app.use(cors());
app.use(express.json());

// 정적 파일 제공
app.use(express.static(path.join(__dirname)));

// 법제처 API 프록시 엔드포인트
app.get('/api/law/search', async (req, res) => {
    try {
        const { query, type = 'lawNm' } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: '검색어를 입력해주세요.' });
        }

        const LAW_API_KEY = process.env.LAW_API_KEY || 'uuc_7326';
        const apiUrl = 'https://www.law.go.kr/DRF/lawSearch.do';
        
        const params = {
            OC: LAW_API_KEY,
            target: 'law',
            type: 'XML',
            query: query
        };

        const response = await axios.get(apiUrl, { params });
        
        res.set('Content-Type', 'application/xml');
        res.send(response.data);

    } catch (error) {
        console.error('법령 검색 오류:', error.message);
        res.status(500).json({ 
            error: '법령 검색 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// 법령 개정이력 조회 프록시 (최근 6개월)
app.get('/api/law/history', async (req, res) => {
    try {
        const LAW_API_KEY = process.env.LAW_API_KEY || 'uuc_7326';
        
        // 주요 안전 관련 법령 키워드
        const keywords = [
            '산업안전보건법',
            '중대재해처벌법',
            '건설기술진흥법',
            '소방시설',
            '위험물안전관리법'
        ];
        
        const allLawElements = [];
        const seenLawIds = new Set(); // 중복 제거용
        
        // 각 키워드로 검색
        for (const keyword of keywords) {
            const apiUrl = 'https://www.law.go.kr/DRF/lawSearch.do';
            const params = {
                OC: LAW_API_KEY,
                target: 'law',
                type: 'XML',
                query: keyword,
                display: '10'
            };

            try {
                const response = await axios.get(apiUrl, { params });
                const xmlText = response.data;
                
                // <law> 태그만 추출 (속성 포함)
                const lawMatches = xmlText.match(/<law[^>]*>(.*?)<\/law>/gs);
                if (lawMatches) {
                    lawMatches.forEach(lawXml => {
                        // 법령ID로 중복 체크
                        const idMatch = lawXml.match(/<법령ID>(.*?)<\/법령ID>/);
                        const lawId = idMatch ? idMatch[1] : null;
                        
                        if (lawId && !seenLawIds.has(lawId)) {
                            seenLawIds.add(lawId);
                            allLawElements.push(lawXml);
                        }
                    });
                }
                console.log(`${keyword} 검색 성공: ${lawMatches ? lawMatches.length : 0}건`);
            } catch (err) {
                console.log(`${keyword} 검색 실패:`, err.message);
            }
        }
        
        // 올바른 XML 문서 생성
        const combinedXML = `<?xml version="1.0" encoding="UTF-8"?>
<LawSearch>
    <totalCnt>${allLawElements.length}</totalCnt>
    ${allLawElements.join('\n')}
</LawSearch>`;
        
        console.log(`총 ${allLawElements.length}건의 법령 반환`);
        
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(combinedXML);

    } catch (error) {
        console.error('개정이력 조회 오류:', error.message);
        res.status(500).json({ 
            error: '개정이력 조회 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// 법령 상세 조회 프록시 (조문 내용 포함)
app.get('/api/law/detail/:serialNo', async (req, res) => {
    try {
        const { serialNo } = req.params;
        
        const LAW_API_KEY = process.env.LAW_API_KEY || 'uuc_7326';
        const apiUrl = 'https://www.law.go.kr/DRF/lawService.do';
        
        const params = {
            OC: LAW_API_KEY,
            target: 'law',
            type: 'XML',
            MST: serialNo
        };

        const response = await axios.get(apiUrl, { params });
        
        console.log(`법령 상세 조회 성공: ${serialNo}`);
        
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(response.data);

    } catch (error) {
        console.error('법령 상세 조회 오류:', error.message);
        res.status(500).json({ 
            error: '법령 상세 조회 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// AI 요약 생성 엔드포인트
app.post('/api/ai/summary', async (req, res) => {
    try {
        const { lawName, changeType, changeDate, ministry, lawContent } = req.body;
        
        if (!lawContent) {
            return res.status(400).json({ error: '법령 내용이 필요합니다.' });
        }
        
        const prompt = `당신은 건설 및 산업 안전 분야의 법률 전문가입니다.

다음 법령 개정 정보를 분석해주세요:

**법령명:** ${lawName}
**개정구분:** ${changeType}
**공포일자:** ${changeDate}
**소관부처:** ${ministry}

**법령 내용 (일부):**
${lawContent}

다음 형식으로 간결하게 답변해주세요:

## 📌 한줄 요약
(30자 이내로 핵심만)

## 🔍 주요 내용 (3-5개)
- 
- 

## ⚠️ 안전관리 업무 영향도
**영향 수준:** [높음/보통/낮음]
**이유:** (1-2문장)

## ✅ 권장 조치사항
1. 
2. 
3. 

## 📅 검토 마감 권장일
(시행일 기준으로 여유있게 제안)`;
        
        // Claude API 호출은 artifacts 환경에서만 작동
        // 일반 Node.js 환경에서는 API 키 필요
        // 임시로 목(mock) 응답 반환
        const mockSummary = `## 📌 한줄 요약
타법개정으로 인한 안전인증 절차 일부 개정

## 🔍 주요 내용 (3-5개)
- 자율안전확인 대상 기계등의 신고 절차 명확화
- 안전인증 제외 대상 구체화 (연구개발, 수출용)
- 부서별 안전관리 책임 범위 재정립

## ⚠️ 안전관리 업무 영향도
**영향 수준:** 보통
**이유:** 타법개정은 주로 기술적 수정이나, 안전인증 절차 변경사항 확인 필요

## ✅ 권장 조치사항
1. 법제처 웹사이트에서 신구문대조표 상세 확인
2. 내부 안전관리규정과의 정합성 검토
3. 관련 부서 담당자 교육 실시

## 📅 검토 마감 권장일
시행일 1개월 전 (${changeDate ? '2025년 9월 1일' : '시행일 확인 후'})`;
        
        console.log(`AI 요약 생성: ${lawName}`);
        
        res.json({ summary: mockSummary });
        
    } catch (error) {
        console.error('AI 요약 생성 오류:', error.message);
        res.status(500).json({ 
            error: 'AI 요약 생성 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// 모든 라우트를 index.html로 리다이렉트 (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`법령 모니터링 시스템이 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`http://localhost:${PORT}`);
});
