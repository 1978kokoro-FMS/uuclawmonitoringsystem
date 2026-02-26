// 법제처 API 테스트 스크립트
const https = require('https');

const API_KEY = 'uuc_7326';
const query = '산업안전보건법';

const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${API_KEY}&target=law&type=XML&query=${encodeURIComponent(query)}`;

console.log('법제처 API 테스트 시작...');
console.log('URL:', url);
console.log('');

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('응답 상태 코드:', res.statusCode);
        console.log('');
        
        if (res.statusCode === 200) {
            console.log('✅ API 연결 성공!');
            console.log('');
            console.log('응답 데이터 (처음 500자):');
            console.log(data.substring(0, 500));
            
            // XML 파싱하여 결과 개수 확인
            const totalCntMatch = data.match(/<totalCnt>(\d+)<\/totalCnt>/);
            if (totalCntMatch) {
                console.log('');
                console.log(`검색 결과: ${totalCntMatch[1]}건`);
            }
        } else {
            console.log('❌ API 연결 실패!');
            console.log('응답 내용:', data);
        }
    });

}).on('error', (err) => {
    console.log('❌ 오류 발생:', err.message);
});
