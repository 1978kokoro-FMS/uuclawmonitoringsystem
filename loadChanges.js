// 법령 변경사항 (개정이력) 로드 - 법제처 API 사용
async function loadChanges() {
    utils.showLoading();
    
    try {
        // 법제처 개정이력 API 호출
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:3000/api/law/history'
            : '/api/law/history';
            
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error('API 호출 실패');
        }

        const xmlText = await response.text();
        
        // XML 파싱
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // 결과 추출
        const lawElements = xmlDoc.getElementsByTagName('law');
        const changes = [];
        
        for (let i = 0; i < lawElements.length; i++) {
            const lawElement = lawElements[i];
            const getLawText = (tagName) => {
                const element = lawElement.getElementsByTagName(tagName)[0];
                return element ? element.textContent.trim() : '';
            };
            
            changes.push({
                law_name: getLawText('법령명한글'),
                law_id: getLawText('법령ID'),
                change_date: getLawText('공포일자'),
                change_type: getLawText('개정구분명') || '개정',
                promulgation_no: getLawText('공포번호'),
                serial_no: getLawText('법령일련번호'),
                ministry: getLawText('소관부처명')
            });
        }

        const changesContainer = document.getElementById('changesList');
        
        if (changes && changes.length > 0) {
            changesContainer.innerHTML = `
                <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0;">📊 안전 관련 법령 현황</h4>
                    <p style="margin: 0; color: #666;">총 <strong>${changes.length}건</strong>의 법령이 검색되었습니다.</p>
                    <p style="margin: 5px 0 0 0; color: #888; font-size: 0.9em;">💡 각 법령의 개정이력은 "신구문대조표 보기"를 클릭하여 확인하세요.</p>
                </div>
            ` + changes.map(change => `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${utils.escapeHtml(change.law_name)}</div>
                        <span class="badge badge-warning">${change.change_type}</span>
                    </div>
                    <div class="list-item-meta">
                        <span>📅 공포일: ${change.change_date ? change.change_date.substring(0,4) + '-' + change.change_date.substring(4,6) + '-' + change.change_date.substring(6,8) : '-'}</span>
                        <span>🏛️ 소관: ${change.ministry || '-'}</span>
                        <span>📄 공포번호: ${change.promulgation_no || '-'}</span>
                    </div>
                    <div class="list-item-content">
                        법령ID: ${change.law_id} | 일련번호: ${change.serial_no}
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-sm btn-success" 
                                onclick='generateAISummary(${JSON.stringify(change).replace(/'/g, "&apos;")})'>
                           🤖 AI 요약
                        </button>
                        <a href="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${change.serial_no}" 
                           target="_blank" 
                           class="btn btn-sm btn-primary"
                           title="법제처 페이지에서 '신구문대조표' 탭을 클릭하세요">
                           📖 법령 상세보기
                        </a>
                    </div>
                </div>
            `).join('');
        } else {
            changesContainer.innerHTML = '<p class="no-data">최근 6개월간 변경사항이 없습니다.</p>';
        }

    } catch (error) {
        console.error('변경사항 로드 오류:', error);
        document.getElementById('changesList').innerHTML = '<p class="no-data">변경사항을 불러오는 중 오류가 발생했습니다.</p>';
        utils.showAlert('변경사항을 불러오는 중 오류가 발생했습니다.', 'error');
    } finally {
        utils.hideLoading();
    }
}
