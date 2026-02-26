// 법령 모니터링 시스템 애플리케이션

// Supabase 클라이언트 초기화 (중복 방지 - var 사용)
var supabase = window.supabaseClient || (window.supabaseClient = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_KEY
));
// 전역 상태
const state = {
    currentTab: 'dashboard',
    selectedLaw: null,
    selectedChange: null
};

// 유틸리티 함수
const utils = {
    // 날짜 포맷
    formatDate: (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    },

    // 날짜시간 포맷
    formatDateTime: (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('ko-KR');
    },

    // 로딩 표시
    showLoading: () => {
        document.getElementById('loadingOverlay').classList.add('show');
    },

    // 로딩 숨김
    hideLoading: () => {
        document.getElementById('loadingOverlay').classList.remove('show');
    },

    // 알림 표시
    showAlert: (message, type = 'info') => {
        alert(message);
    },

    // HTML 이스케이프
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// 탭 전환 기능
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            // 모든 탭 비활성화
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // 선택한 탭 활성화
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');

            state.currentTab = tabName;

            // 탭별 데이터 로드
            loadTabData(tabName);
        });
    });
}

// 탭별 데이터 로드
async function loadTabData(tabName) {
    switch (tabName) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'keywords':
            await loadKeywords();
            break;
        case 'changes':
            await loadChanges();
            break;
        case 'actions':
            await loadActions();
            break;
    }
}

// 대시보드 로드
async function loadDashboard() {
    try {
        // 통계 로드
        const [lawsCount, changesCount, keywordsCount, actionsCount] = await Promise.all([
            supabase.from('laws').select('*', { count: 'exact', head: true }),
            supabase.from('law_changes').select('*', { count: 'exact', head: true }).eq('is_reviewed', false),
            supabase.from('monitoring_keywords').select('*', { count: 'exact', head: true }).eq('is_active', true),
            supabase.from('action_items').select('*', { count: 'exact', head: true }).eq('status', 'PENDING')
        ]);

        document.getElementById('totalLaws').textContent = lawsCount.count || 0;
        document.getElementById('pendingChanges').textContent = changesCount.count || 0;
        document.getElementById('activeKeywords').textContent = keywordsCount.count || 0;
        document.getElementById('pendingActions').textContent = actionsCount.count || 0;

        // 최근 변경사항 로드
        const { data: recentChanges, error: changesError } = await supabase
            .from('law_changes')
            .select(`
                *,
                laws (law_name)
            `)
            .order('detected_at', { ascending: false })
            .limit(5);

        if (changesError) throw changesError;

        const recentChangesContainer = document.getElementById('recentChanges');
        if (recentChanges && recentChanges.length > 0) {
            recentChangesContainer.innerHTML = recentChanges.map(change => `
                <div class="list-item" style="cursor: pointer;" onclick="switchToChangesTab()">
                    <div class="list-item-header">
                        <div class="list-item-title">${utils.escapeHtml(change.laws?.law_name || change.law_id)}</div>
                        <span class="badge badge-${change.is_reviewed ? 'success' : 'warning'}">
                            ${change.is_reviewed ? '검토완료' : '미검토'}
                        </span>
                    </div>
                    <div class="list-item-meta">
                        ${change.change_type} | ${utils.formatDateTime(change.detected_at)}
                    </div>
                    <div class="list-item-content">
                        ${utils.escapeHtml(change.change_content?.substring(0, 100) || '')}...
                        <span style="color: #2563eb; font-weight: 500;">클릭하여 상세보기 →</span>
                    </div>
                </div>
            `).join('') + `
                <div style="text-align: center; margin-top: 15px;">
                    <button class="btn btn-primary" onclick="switchToChangesTab()">
                        📝 모든 변경사항 보기 (최근 6개월)
                    </button>
                </div>
            `;
        } else {
            recentChangesContainer.innerHTML = `
                <p class="no-data">데이터베이스에 변경사항이 없습니다.</p>
                <div style="text-align: center; margin-top: 15px;">
                    <button class="btn btn-primary" onclick="switchToChangesTab()">
                        📝 최근 6개월 법령 개정이력 확인하기
                    </button>
                </div>
            `;
        }

        // 긴급 조치사항 로드
        const { data: urgentActions, error: actionsError } = await supabase
            .from('action_items')
            .select('*')
            .eq('priority', 'HIGH')
            .in('status', ['PENDING', 'IN_PROGRESS'])
            .order('created_at', { ascending: false })
            .limit(5);

        if (actionsError) throw actionsError;

        const urgentActionsContainer = document.getElementById('urgentActions');
        if (urgentActions && urgentActions.length > 0) {
            urgentActionsContainer.innerHTML = urgentActions.map(action => `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${utils.escapeHtml(action.title)}</div>
                        <span class="badge priority-${action.priority.toLowerCase()}">${action.priority}</span>
                    </div>
                    <div class="list-item-meta">
                        상태: ${action.status} | 담당: ${action.assigned_to || '미지정'}
                        ${action.due_date ? ` | 마감: ${utils.formatDate(action.due_date)}` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            urgentActionsContainer.innerHTML = '<p class="no-data">긴급 조치사항이 없습니다.</p>';
        }

        // 모니터링 중인 법령 목록
        const { data: monitoringLaws, error: lawsListError } = await supabase
            .from('laws')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (lawsListError) throw lawsListError;

        const monitoringLawsContainer = document.getElementById('monitoringLaws');
        if (monitoringLaws && monitoringLaws.length > 0) {
            monitoringLawsContainer.innerHTML = monitoringLaws.map(law => `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${utils.escapeHtml(law.law_name)}</div>
                        <span class="badge badge-success">모니터링 중</span>
                    </div>
                    <div class="list-item-meta">
                        법령ID: ${law.law_id} | 소관: ${law.ministry || '-'}
                        ${law.enacted_date ? ` | 공포일: ${law.enacted_date.substring(0,4)}-${law.enacted_date.substring(4,6)}-${law.enacted_date.substring(6,8)}` : ''}
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-sm btn-secondary" onclick="removeLawFromMonitoring('${law.law_id}')">❌ 제거</button>
                    </div>
                </div>
            `).join('');
        } else {
            monitoringLawsContainer.innerHTML = '<p class="no-data">모니터링 중인 법령이 없습니다.</p>';
        }

        // 마지막 업데이트 시간 표시
        document.getElementById('lastUpdate').textContent = 
            `마지막 업데이트: ${utils.formatDateTime(new Date())}`;

    } catch (error) {
        console.error('대시보드 로드 오류:', error);
        utils.showAlert('대시보드 데이터를 불러오는 중 오류가 발생했습니다.', 'error');
    }
}

// 법령 검색
async function searchLaws() {
    const searchInput = document.getElementById('searchInput').value.trim();
    const searchType = document.getElementById('searchType').value;

    if (!searchInput) {
        utils.showAlert('검색어를 입력해주세요.', 'warning');
        return;
    }

    utils.showLoading();

    try {
        // 법제처 API 호출 (프록시 사용)
        // 로컬 테스트용: 서버 실행 후 사용
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? `http://localhost:3000/api/law/search?query=${encodeURIComponent(searchInput)}&type=${searchType}`
            : `/api/law/search?query=${encodeURIComponent(searchInput)}&type=${searchType}`;
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
        const laws = [];
        
        for (let i = 0; i < lawElements.length; i++) {
            const lawElement = lawElements[i];
            const getLawText = (tagName) => {
                const element = lawElement.getElementsByTagName(tagName)[0];
                return element ? element.textContent.trim() : '';
            };
            
            laws.push({
                law_id: getLawText('법령ID'),
                law_name: getLawText('법령명한글'),
                law_type: getLawText('법령구분명'),
                ministry: getLawText('소관부처명'),
                enacted_date: getLawText('공포일자'),
                serial_no: getLawText('법령일련번호'),
                promulgation_no: getLawText('공포번호')
            });
        }

        const resultsContainer = document.getElementById('searchResults');
        
        if (laws && laws.length > 0) {
            // 검색 결과를 전역 변수에 저장
            window.searchResults = laws;
            
            resultsContainer.innerHTML = laws.map((law, index) => `
                <div class="search-result-item" onclick="showLawDetailFromAPI(window.searchResults[${index}])">
                    <div class="search-result-title">${utils.escapeHtml(law.law_name)}</div>
                    <div class="search-result-meta">
                        <span>법령ID: ${law.law_id}</span>
                        <span>소관부챘: ${law.ministry || '-'}</span>
                        <span>공포일: ${law.enacted_date ? law.enacted_date.substring(0,4) + '-' + law.enacted_date.substring(4,6) + '-' + law.enacted_date.substring(6,8) : '-'}</span>
                        <span>법령구분: ${law.law_type || '-'}</span>
                    </div>
                    <div class="search-result-content">
                        공포번호: ${law.promulgation_no || '-'} | 일련번호: ${law.serial_no}
                    </div>
                </div>
            `).join('');
        } else {
            resultsContainer.innerHTML = '<p class="no-data">검색 결과가 없습니다.</p>';
        }

    } catch (error) {
        console.error('검색 오류:', error);
        utils.showAlert('법령 검색 중 오류가 발생했습니다.', 'error');
    } finally {
        utils.hideLoading();
    }
}

// 법령 상세 보기
async function showLawDetail(lawId) {
    try {
        const { data: law, error } = await supabase
            .from('laws')
            .select('*')
            .eq('law_id', lawId)
            .single();

        if (error) throw error;

        state.selectedLaw = law;

        const modal = document.getElementById('lawDetailModal');
        document.getElementById('modalLawName').textContent = law.law_name;
        document.getElementById('modalLawContent').innerHTML = `
            <p><strong>법령ID:</strong> ${law.law_id}</p>
            <p><strong>소관부처:</strong> ${law.ministry || '-'}</p>
            <p><strong>공포일:</strong> ${utils.formatDate(law.enacted_date)}</p>
            <p><strong>마지막 업데이트:</strong> ${utils.formatDateTime(law.last_updated)}</p>
            <hr>
            <div style="max-height: 400px; overflow-y: auto;">
                ${utils.escapeHtml(law.content || '내용 없음')}
            </div>
        `;

        modal.classList.add('show');

    } catch (error) {
        console.error('법령 상세 조회 오류:', error);
        utils.showAlert('법령 상세 정보를 불러오는 중 오류가 발생했습니다.', 'error');
    }
}

// 모니터링에 추가
async function addToMonitoring() {
    if (!state.selectedLaw) return;

    try {
        // 중복 체크
        const { data: existing, error: checkError } = await supabase
            .from('laws')
            .select('*')
            .eq('law_id', state.selectedLaw.law_id)
            .eq('is_active', true)
            .single();

        if (existing) {
            utils.showAlert('이미 모니터링 중인 법령입니다.', 'warning');
            return;
        }

        const { data, error } = await supabase
            .from('laws')
            .upsert({
                law_id: state.selectedLaw.law_id,
                law_name: state.selectedLaw.law_name,
                law_type: state.selectedLaw.law_type,
                ministry: state.selectedLaw.ministry,
                enacted_date: state.selectedLaw.enacted_date,
                serial_no: state.selectedLaw.serial_no,
                promulgation_no: state.selectedLaw.promulgation_no,
                is_active: true
            });

        if (error) throw error;

        utils.showAlert(`"${state.selectedLaw.law_name}"가 모니터링에 추가되었습니다.`, 'success');
        document.getElementById('lawDetailModal').classList.remove('show');
        loadDashboard();

    } catch (error) {
        console.error('모니터링 추가 오류:', error);
        utils.showAlert('모니터링 추가 중 오류가 발생했습니다.', 'error');
    }
}

// 모니터링에서 제거
async function removeLawFromMonitoring(lawId) {
    if (!confirm('이 법령을 모니터링에서 제거하시결습니까?')) return;

    try {
        const { error } = await supabase
            .from('laws')
            .update({ is_active: false })
            .eq('law_id', lawId);

        if (error) throw error;

        utils.showAlert('모니터링에서 제거되었습니다.', 'success');
        loadDashboard();

    } catch (error) {
        console.error('모니터링 제거 오류:', error);
        utils.showAlert('모니터링 제거 중 오류가 발생했습니다.', 'error');
    }
}

// 키워드 관리
async function loadKeywords() {
    try {
        const { data: keywords, error } = await supabase
            .from('monitoring_keywords')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const keywordsContainer = document.getElementById('keywordsList');
        
        if (keywords && keywords.length > 0) {
            keywordsContainer.innerHTML = keywords.map(keyword => `
                <div class="keyword-tag">
                    <div>
                        <strong>${utils.escapeHtml(keyword.keyword)}</strong>
                        ${keyword.category ? ` <span class="badge badge-info">${keyword.category}</span>` : ''}
                        ${keyword.description ? `<br><small>${utils.escapeHtml(keyword.description)}</small>` : ''}
                    </div>
                    <span class="keyword-tag-delete" onclick="deleteKeyword(${keyword.id})">✕</span>
                </div>
            `).join('');
        } else {
            keywordsContainer.innerHTML = '<p class="no-data">등록된 키워드가 없습니다.</p>';
        }

    } catch (error) {
        console.error('키워드 로드 오류:', error);
        utils.showAlert('키워드를 불러오는 중 오류가 발생했습니다.', 'error');
    }
}

// 키워드 추가
async function addKeyword() {
    const keyword = document.getElementById('keywordInput').value.trim();
    const category = document.getElementById('categoryInput').value.trim();
    const description = document.getElementById('descriptionInput').value.trim();

    if (!keyword) {
        utils.showAlert('키워드를 입력해주세요.', 'warning');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('monitoring_keywords')
            .insert({
                keyword: keyword,
                category: category || null,
                description: description || null,
                is_active: true
            });

        if (error) throw error;

        document.getElementById('keywordInput').value = '';
        document.getElementById('categoryInput').value = '';
        document.getElementById('descriptionInput').value = '';

        utils.showAlert('키워드가 추가되었습니다.', 'success');
        loadKeywords();

    } catch (error) {
        console.error('키워드 추가 오류:', error);
        utils.showAlert('키워드 추가 중 오류가 발생했습니다.', 'error');
    }
}

// 키워드 삭제
async function deleteKeyword(id) {
    if (!confirm('이 키워드를 삭제하시겠습니까?')) return;

    try {
        const { error } = await supabase
            .from('monitoring_keywords')
            .delete()
            .eq('id', id);

        if (error) throw error;

        utils.showAlert('키워드가 삭제되었습니다.', 'success');
        loadKeywords();

    } catch (error) {
        console.error('키워드 삭제 오류:', error);
        utils.showAlert('키워드 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// 변경사항 로드
async function loadChanges() {
    try {
        const reviewFilter = document.getElementById('reviewFilter').value;
        
        let query = supabase
            .from('law_changes')
            .select(`
                *,
                laws (law_name)
            `)
            .order('detected_at', { ascending: false });

        if (reviewFilter === 'pending') {
            query = query.eq('is_reviewed', false);
        } else if (reviewFilter === 'reviewed') {
            query = query.eq('is_reviewed', true);
        }

        const { data: changes, error } = await query;

        if (error) throw error;

        const changesContainer = document.getElementById('changesList');
        
        if (changes && changes.length > 0) {
            changesContainer.innerHTML = changes.map(change => `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${utils.escapeHtml(change.laws?.law_name || change.law_id)}</div>
                        <div>
                            <span class="badge badge-${change.change_type === 'NEW' ? 'info' : change.change_type === 'AMENDED' ? 'warning' : 'danger'}">
                                ${change.change_type}
                            </span>
                            <span class="badge badge-${change.is_reviewed ? 'success' : 'warning'}">
                                ${change.is_reviewed ? '검토완료' : '미검토'}
                            </span>
                        </div>
                    </div>
                    <div class="list-item-meta">
                        변경일: ${utils.formatDate(change.change_date)} | 감지: ${utils.formatDateTime(change.detected_at)}
                        ${change.reviewed_by ? ` | 검토자: ${change.reviewed_by}` : ''}
                    </div>
                    <div class="list-item-content">${utils.escapeHtml(change.change_content || '')}</div>
                    <div class="list-item-actions">
                        ${!change.is_reviewed ? `<button class="btn btn-sm btn-primary" onclick="reviewChange(${change.id})">검토 완료</button>` : ''}
                        <button class="btn btn-sm btn-success" onclick="createActionFromChange(${change.id})">조치사항 생성</button>
                    </div>
                </div>
            `).join('');
        } else {
            changesContainer.innerHTML = '<p class="no-data">변경사항이 없습니다.</p>';
        }

    } catch (error) {
        console.error('변경사항 로드 오류:', error);
        utils.showAlert('변경사항을 불러오는 중 오류가 발생했습니다.', 'error');
    }
}

// 변경사항 검토
async function reviewChange(id) {
    try {
        const reviewerName = prompt('검토자 이름을 입력하세요:');
        if (!reviewerName) return;

        const { error } = await supabase
            .from('law_changes')
            .update({
                is_reviewed: true,
                reviewed_by: reviewerName,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        utils.showAlert('검토가 완료되었습니다.', 'success');
        loadChanges();
        loadDashboard();

    } catch (error) {
        console.error('검토 완료 오류:', error);
        utils.showAlert('검토 완료 처리 중 오류가 발생했습니다.', 'error');
    }
}

// 변경사항으로부터 조치사항 생성
function createActionFromChange(changeId) {
    state.selectedChange = changeId;
    document.getElementById('actionLawChangeId').value = changeId;
    document.getElementById('actionModal').classList.add('show');
}

// 조치사항 로드
async function loadActions() {
    try {
        const statusFilter = document.getElementById('statusFilter').value;
        const priorityFilter = document.getElementById('priorityFilter').value;
        
        let query = supabase
            .from('action_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        if (priorityFilter !== 'all') {
            query = query.eq('priority', priorityFilter);
        }

        const { data: actions, error } = await query;

        if (error) throw error;

        const actionsContainer = document.getElementById('actionsList');
        
        if (actions && actions.length > 0) {
            actionsContainer.innerHTML = actions.map(action => `
                <div class="list-item">
                    <div class="list-item-header">
                        <div class="list-item-title">${utils.escapeHtml(action.title)}</div>
                        <div>
                            <span class="badge priority-${action.priority.toLowerCase()}">${action.priority}</span>
                            <span class="badge badge-${action.status === 'COMPLETED' ? 'success' : action.status === 'IN_PROGRESS' ? 'warning' : 'secondary'}">
                                ${action.status}
                            </span>
                        </div>
                    </div>
                    <div class="list-item-meta">
                        담당: ${action.assigned_to || '미지정'} | 
                        생성: ${utils.formatDate(action.created_at)}
                        ${action.due_date ? ` | 마감: ${utils.formatDate(action.due_date)}` : ''}
                    </div>
                    <div class="list-item-content">${utils.escapeHtml(action.description || '')}</div>
                    ${action.notes ? `<div class="list-item-meta">메모: ${utils.escapeHtml(action.notes)}</div>` : ''}
                    <div class="list-item-actions">
                        ${action.status === 'PENDING' ? `<button class="btn btn-sm btn-warning" onclick="updateActionStatus(${action.id}, 'IN_PROGRESS')">진행 시작</button>` : ''}
                        ${action.status === 'IN_PROGRESS' ? `<button class="btn btn-sm btn-success" onclick="updateActionStatus(${action.id}, 'COMPLETED')">완료</button>` : ''}
                        <button class="btn btn-sm btn-secondary" onclick="addActionNote(${action.id})">메모 추가</button>
                    </div>
                </div>
            `).join('');
        } else {
            actionsContainer.innerHTML = '<p class="no-data">조치사항이 없습니다.</p>';
        }

    } catch (error) {
        console.error('조치사항 로드 오류:', error);
        utils.showAlert('조치사항을 불러오는 중 오류가 발생했습니다.', 'error');
    }
}

// 조치사항 상태 업데이트
async function updateActionStatus(id, status) {
    try {
        const updateData = {
            status: status
        };

        if (status === 'COMPLETED') {
            updateData.completed_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('action_items')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        utils.showAlert('상태가 업데이트되었습니다.', 'success');
        loadActions();
        loadDashboard();

    } catch (error) {
        console.error('상태 업데이트 오류:', error);
        utils.showAlert('상태 업데이트 중 오류가 발생했습니다.', 'error');
    }
}

// 조치사항 메모 추가
async function addActionNote(id) {
    const note = prompt('메모를 입력하세요:');
    if (!note) return;

    try {
        const { error } = await supabase
            .from('action_items')
            .update({
                notes: note
            })
            .eq('id', id);

        if (error) throw error;

        utils.showAlert('메모가 추가되었습니다.', 'success');
        loadActions();

    } catch (error) {
        console.error('메모 추가 오류:', error);
        utils.showAlert('메모 추가 중 오류가 발생했습니다.', 'error');
    }
}

// 변경사항 확인 (법제처 API 호출)
async function checkForChanges() {
    utils.showLoading();

    try {
        // 모니터링 중인 법령 가져오기
        const { data: laws, error: lawsError } = await supabase
            .from('laws')
            .select('*')
            .eq('is_active', true);

        if (lawsError) throw lawsError;

        if (!laws || laws.length === 0) {
            utils.showAlert('모니터링 중인 법령이 없습니다.', 'info');
            utils.hideLoading();
            return;
        }

        // 각 법령에 대해 변경사항 확인
        let changesDetected = 0;

        for (const law of laws) {
            // 여기서 실제로는 법제처 API를 호출하여 최신 정보를 가져와야 합니다
            // CORS 문제로 인해 서버사이드 프록시가 필요할 수 있습니다
            
            // 예시: 랜덤하게 변경사항 감지 (실제로는 API 응답과 비교)
            if (Math.random() > 0.8) {
                const { error: insertError } = await supabase
                    .from('law_changes')
                    .insert({
                        law_id: law.law_id,
                        change_type: 'AMENDED',
                        change_date: new Date().toISOString().split('T')[0],
                        change_content: '법령 내용이 수정되었습니다.',
                        is_reviewed: false
                    });

                if (!insertError) changesDetected++;
            }
        }

        // 모니터링 로그 기록
        await supabase.from('monitoring_logs').insert({
            log_type: 'API_CALL',
            message: `${laws.length}개 법령 확인 완료. ${changesDetected}개 변경사항 감지.`,
            details: { laws_checked: laws.length, changes_detected: changesDetected }
        });

        utils.showAlert(`변경사항 확인 완료. ${changesDetected}개의 변경사항이 감지되었습니다.`, 'success');
        loadDashboard();
        loadChanges();

    } catch (error) {
        console.error('변경사항 확인 오류:', error);
        utils.showAlert('변경사항 확인 중 오류가 발생했습니다.', 'error');
    } finally {
        utils.hideLoading();
    }
}

// 이벤트 리스너 초기화
function initEventListeners() {
    // 새로고침 버튼
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadTabData(state.currentTab);
    });

    // 검색 버튼
    document.getElementById('searchBtn').addEventListener('click', searchLaws);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchLaws();
    });

    // 키워드 추가 버튼
    document.getElementById('addKeywordBtn').addEventListener('click', addKeyword);

    // 모니터링 추가 버튼
    document.getElementById('addToMonitoringBtn').addEventListener('click', addToMonitoring);

    // 변경사항 확인 버튼 (법제처 API 개정이력)
    document.getElementById('checkChangesBtn').addEventListener('click', loadChanges);

    // 필터 변경
    document.getElementById('reviewFilter').addEventListener('change', loadChanges);
    document.getElementById('statusFilter').addEventListener('change', loadActions);
    document.getElementById('priorityFilter').addEventListener('change', loadActions);

    // 모달 닫기
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').classList.remove('show');
        });
    });

    // 모달 외부 클릭시 닫기
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });

    // 조치사항 폼 제출
    document.getElementById('actionForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            const { error } = await supabase
                .from('action_items')
                .insert({
                    law_change_id: document.getElementById('actionLawChangeId').value || null,
                    title: document.getElementById('actionTitle').value,
                    description: document.getElementById('actionDescription').value,
                    priority: document.getElementById('actionPriority').value,
                    assigned_to: document.getElementById('actionAssignee').value || null,
                    due_date: document.getElementById('actionDueDate').value || null,
                    status: 'PENDING'
                });

            if (error) throw error;

            utils.showAlert('조치사항이 추가되었습니다.', 'success');
            document.getElementById('actionModal').classList.remove('show');
            document.getElementById('actionForm').reset();
            loadActions();
            loadDashboard();

        } catch (error) {
            console.error('조치사항 추가 오류:', error);
            utils.showAlert('조치사항 추가 중 오류가 발생했습니다.', 'error');
        }
    });
}

// 앱 초기화
async function initApp() {
    console.log('법령 모니터링 시스템 시작...');
    
    initTabs();
    initEventListeners();
    
    // 대시보드 로드
    await loadDashboard();

    // 자동 새로고침 설정 (5분마다)
    setInterval(() => {
        if (state.currentTab === 'dashboard') {
            loadDashboard();
        }
    }, CONFIG.AUTO_REFRESH_INTERVAL);
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', initApp);
