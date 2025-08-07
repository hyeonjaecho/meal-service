
// API 설정
const API_BASE_URL = 'https://open.neis.go.kr/hub/mealServiceDietInfo';
const ATPT_OFCDC_SC_CODE = 'J10'; // 경기도교육청
const SD_SCHUL_CODE = '7530079'; // 학교코드

// DOM 요소들
const dateInput = document.getElementById('date-input');
const searchBtn = document.getElementById('search-btn');
const loadingDiv = document.getElementById('loading');
const mealInfoDiv = document.getElementById('meal-info');
const errorDiv = document.getElementById('error-message');
const mealDateH2 = document.getElementById('meal-date');
const breakfastDiv = document.getElementById('breakfast');
const lunchDiv = document.getElementById('lunch');
const dinnerDiv = document.getElementById('dinner');

// 오늘 날짜를 기본값으로 설정
const today = new Date();
const todayString = today.toISOString().split('T')[0];
dateInput.value = todayString;

// 이벤트 리스너 추가
searchBtn.addEventListener('click', searchMealInfo);
dateInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchMealInfo();
    }
});

// 페이지 로드 시 오늘 급식 정보 조회
window.addEventListener('load', () => {
    searchMealInfo();
});

// 급식 정보 조회 함수
async function searchMealInfo() {
    const selectedDate = dateInput.value;
    
    if (!selectedDate) {
        alert('날짜를 선택해주세요.');
        return;
    }
    
    // 날짜 형식 변환 (YYYY-MM-DD -> YYYYMMDD)
    const formattedDate = selectedDate.replace(/-/g, '');
    
    // UI 상태 변경
    showLoading();
    
    try {
        const mealData = await fetchMealData(formattedDate);
        displayMealInfo(mealData, selectedDate);
    } catch (error) {
        console.error('급식 정보 조회 오류:', error);
        showError();
    }
}

// API에서 급식 데이터 가져오기
async function fetchMealData(date) {
    const url = `${API_BASE_URL}?ATPT_OFCDC_SC_CODE=${ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${SD_SCHUL_CODE}&MLSV_YMD=${date}&Type=xml`;
    
    // CORS 문제 해결을 위해 다른 프록시 서버 사용
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    try {
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error('네트워크 응답이 올바르지 않습니다.');
        }
        
        const xmlText = await response.text();
        console.log('받은 XML:', xmlText); // 디버깅용
        return parseXMLResponse(xmlText);
    } catch (error) {
        console.error('Fetch 오류:', error);
        // 대체 프록시 시도
        const altProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const altResponse = await fetch(altProxyUrl);
        
        if (!altResponse.ok) {
            throw new Error('네트워크 응답이 올바르지 않습니다.');
        }
        
        const xmlText = await altResponse.text();
        console.log('받은 XML (대체):', xmlText); // 디버깅용
        return parseXMLResponse(xmlText);
    }
}

// XML 응답 파싱
function parseXMLResponse(xmlText) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // 파싱 오류 체크
        const parseError = xmlDoc.getElementsByTagName('parsererror');
        if (parseError.length > 0) {
            console.error('XML 파싱 오류:', parseError[0].textContent);
            throw new Error('응답 데이터 형식이 올바르지 않습니다.');
        }
        
        // API 오류 체크
        const resultElements = xmlDoc.getElementsByTagName('RESULT');
        if (resultElements.length > 0) {
            const errorCode = resultElements[0].getElementsByTagName('CODE')[0]?.textContent;
            const errorMessage = resultElements[0].getElementsByTagName('MESSAGE')[0]?.textContent;
            console.log('API 응답 코드:', errorCode, '메시지:', errorMessage);
            
            if (errorCode && errorCode !== 'INFO-000') {
                throw new Error(`급식 정보를 찾을 수 없습니다. (${errorMessage || '데이터 없음'})`);
            }
        }
        
        const meals = [];
        const rows = xmlDoc.getElementsByTagName('row');
        
        console.log('찾은 급식 데이터 개수:', rows.length);
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            const mealType = getElementText(row, 'MMEAL_SC_NM');
            const dishName = getElementText(row, 'DDISH_NM');
            const mealDate = getElementText(row, 'MLSV_YMD');
            
            console.log(`급식 ${i+1} 상세:`, { 
                mealType: mealType, 
                dishName: dishName?.substring(0, 100) + '...', 
                mealDate: mealDate,
                hasType: !!mealType,
                hasDish: !!dishName,
                dishLength: dishName?.length
            });
            
            if (mealType && dishName) {
                // 요리명을 <br/> 기준으로 분할하고 빈 문자열 제거
                const dishes = dishName.split('<br/>').map(dish => dish.trim()).filter(dish => dish !== '');
                
                meals.push({
                    type: mealType,
                    dishes: dishes,
                    date: mealDate
                });
                
                console.log(`추가된 급식 정보:`, { type: mealType, dishCount: dishes.length });
            } else {
                console.log('급식 정보 누락:', { mealType: !!mealType, dishName: !!dishName });
            }
        }
        
        // 데이터가 없는 경우
        if (meals.length === 0 && rows.length === 0) {
            // 급식 데이터를 찾는 다른 태그들도 확인
            const mealServiceRows = xmlDoc.getElementsByTagName('mealServiceDietInfo');
            if (mealServiceRows.length === 0) {
                throw new Error('해당 날짜에 급식 정보가 없습니다.');
            }
        }
        
        return meals;
        
    } catch (error) {
        console.error('XML 파싱 중 오류:', error);
        throw error;
    }
}

// XML 요소에서 텍스트 추출 (CDATA 처리 개선)
function getElementText(parent, tagName) {
    const element = parent.getElementsByTagName(tagName)[0];
    if (!element) return '';
    
    // CDATA 섹션이 있는 경우 처리
    const text = element.textContent || element.innerHTML;
    return text.trim();
}

// 급식 정보 표시
function displayMealInfo(meals, selectedDate) {
    hideAll();
    
    console.log('표시할 급식 데이터:', meals);
    
    if (meals.length === 0) {
        console.log('급식 데이터가 없어 오류 표시');
        showError();
        return;
    }
    
    // 날짜 표시
    const dateObj = new Date(selectedDate);
    const dateString = dateObj.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
    mealDateH2.textContent = `${dateString} 급식 정보`;
    
    // 급식 정보 초기화
    breakfastDiv.innerHTML = '<p>정보 없음</p>';
    lunchDiv.innerHTML = '<p>정보 없음</p>';
    dinnerDiv.innerHTML = '<p>정보 없음</p>';
    
    // 급식 데이터 표시
    meals.forEach((meal, index) => {
        console.log(`급식 표시 ${index + 1}:`, meal);
        
        const dishList = meal.dishes.map(dish => {
            // 알레르기 정보 제거 및 정리
            const cleanDish = dish.replace(/\([^)]*\)/g, '').replace(/\*/g, '').trim();
            return `<li>${cleanDish}</li>`;
        }).join('');
        
        const dishHtml = dishList ? `<ul>${dishList}</ul>` : '<p>정보 없음</p>';
        
        console.log(`급식 타입: "${meal.type}", 요리 개수: ${meal.dishes.length}`);
        
        if (meal.type.includes('조식') || meal.type === '조식') {
            breakfastDiv.innerHTML = dishHtml;
            console.log('조식 정보 설정됨');
        } else if (meal.type.includes('중식') || meal.type === '중식') {
            lunchDiv.innerHTML = dishHtml;
            console.log('중식 정보 설정됨');
        } else if (meal.type.includes('석식') || meal.type === '석식') {
            dinnerDiv.innerHTML = dishHtml;
            console.log('석식 정보 설정됨');
        } else {
            console.log('알 수 없는 급식 타입:', meal.type);
            // 기본적으로 중식으로 처리
            lunchDiv.innerHTML = dishHtml;
        }
    });
    
    mealInfoDiv.classList.remove('hidden');
    console.log('급식 정보 표시 완료');
}

// UI 상태 관리 함수들
function showLoading() {
    hideAll();
    loadingDiv.classList.remove('hidden');
}

function showError() {
    hideAll();
    errorDiv.classList.remove('hidden');
}

function hideAll() {
    loadingDiv.classList.add('hidden');
    mealInfoDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
}
