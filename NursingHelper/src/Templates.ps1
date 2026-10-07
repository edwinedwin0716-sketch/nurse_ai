# 간호진단 템플릿과 간호과정 문서 생성기 (UI 없음 · 단독 테스트 가능)
# 각 항목: 계획(plan)과 이론적 근거(why). 중재는 계획 문장을 과거형으로 바꿔 자동 생성한다.

$script:Templates = [ordered]@{
'급성 통증' = @{
    en = 'Acute pain'
    domain = '12. 안위 Comfort'
    cls = '1. 신체적 안위 Physical comfort'
    page = 26
    problem = '통증'
    priority = 3
    reason = '대상자가 현재 가장 크게 호소하는 실제적 문제로, 수면·활동·식사 같은 다른 기본 욕구를 방해한다'
    evalData = 'NRS 통증 점수(매 듀티), 비언어적 통증 표현, 진통제 투여 후 반응, 통증 완화 방법을 말로 표현하는지'
    keywords = 'NRS|통증|아파|아프|쥐어짜|찌르|욱신|pain|움켜|웅크|진통|데노간|타이레놀|트라마돌|모르핀|peritonitis|복막염|수술 후|post ?op'
    cause = '복강 내 염증'
    long = '대상자는 퇴원 시 통증을 호소하지 않을 것이다.'
    short = @('대상자는 1주일 내 통증점수가 {nrsGoal}점 이하로 감소될 것이다.','대상자는 3일 내 통증 완화 방법을 두 가지 이상 말로 표현할 것이다.')
    diag = @(
        @{plan='매 4시간마다 V/S를 사정한다.';why='통증은 교감신경을 자극하여 혈압·맥박·호흡수를 상승시키므로 활력징후 변화로 통증과 합병증을 조기에 파악할 수 있다.'},
        @{plan='매 듀티마다 통증의 양상(부위, 강도 NRS, 지속시간, 빈도, 악화·완화 요인)을 사정한다.';why='통증은 주관적 경험이므로 체계적으로 반복 사정해야 중재 효과를 평가하고 계획을 수정할 수 있다.'},
        @{plan='통증과 관련된 비언어적 표현(얼굴 찡그림, 웅크린 자세, 보호 행동)을 관찰한다.';why='비언어적 행동은 대상자가 표현하지 못한 통증 정도를 파악하는 객관적 지표가 된다.'})
    ther = @(
        @{plan='처방에 따라 진통제를 투여하고 투여 30분~1시간 후 효과와 부작용을 확인한다.';why='진통제는 통증 전달 경로를 차단하여 통증을 감소시키며, 약물의 최고 효과 시간에 재사정하여 효과와 부작용(오심, 호흡억제 등)을 평가한다.'},
        @{plan='통증 악화 요인(소음, 불편한 체위, 복부 압박 등)을 제거한다.';why='악화 요인을 줄이면 통증 자극이 감소하고 통증 역치가 높아진다.'},
        @{plan='조용하고 편안한 환경을 제공한다.';why='환경적 스트레스를 줄이면 불안이 감소하여 통증 지각이 줄어든다.'},
        @{plan='금기가 아닐 시 편안한 체위(무릎을 굽힌 자세 등)를 취하게 하고 심호흡을 격려한다.';why='무릎을 굽힌 자세는 복부 근육의 긴장을 완화하고, 심호흡은 이완 반응을 유도하여 통증을 감소시킨다.'},
        @{plan='금기가 아닐 시 통증 부위에 냉·온요법을 적용한다.';why='냉요법은 혈관 수축과 신경 전도 속도 감소로 염증성 통증과 부종을 줄이고, 온요법은 근육 이완과 혈류 증가로 통증을 완화한다(급성 염증·출혈 시 온요법 금기).'},
        @{plan='심리적 지지를 제공하고 통증 표현을 격려한다.';why='불안과 두려움은 통증을 증가시키므로 정서적 지지로 통증 지각을 완화할 수 있다.'})
    edu = @(
        @{plan='대상자에게 통증 완화 방법(심호흡, 이완요법, 체위 변경)을 교육한다.';why='비약물적 통증 관리 방법을 스스로 사용할 수 있으면 통증 조절에 대한 자기효능감이 높아진다.'},
        @{plan='통증이 심해지거나 양상이 변하면 즉시 알리도록 교육한다.';why='통증 양상의 변화는 합병증의 징후일 수 있어 조기 발견이 필요하다.'})
}
'고체온' = @{
    en = 'Hyperthermia'
    domain = '11. 안전/보호 Safety/Protection'
    cls = '6. 체온조절 Thermoregulation'
    page = 26
    problem = '발열'
    priority = 2
    reason = '체온 조절 실패로 수분 손실과 대사 요구를 늘려 탈수로 이어질 수 있는 생리적 문제이다'
    evalData = '매 2~4시간 체온, 일평균 체온, 수분 섭취량, I/O, 오한 여부'
    keywords = 'fever|발열|열이|고열|체온|\bBT\b|38\.|39\.|40\.|chill|오한|떨림'
    cause = '감염 과정'
    long = '대상자는 퇴원 시 정상 체온(36.5~37.5℃)을 유지할 것이다.'
    short = @('대상자는 3일 내 체온이 37.5℃ 이하로 내려갈 것이다.','대상자는 2일 내 하루 수분 섭취량이 2,000mL 이상 유지될 것이다.')
    diag = @(
        @{plan='매 2~4시간마다 체온을 포함한 V/S를 측정한다.';why='체온 변화 양상을 확인하여 해열 중재의 효과와 감염 진행 여부를 평가할 수 있다.'},
        @{plan='섭취량과 배설량(I/O)을 측정하고 탈수 징후(피부 탄력, 점막 건조, 소변량)를 사정한다.';why='고체온은 불감성 수분 손실을 증가시켜 탈수를 유발할 수 있다.'},
        @{plan='WBC, CRP 등 검사 결과를 확인한다.';why='염증 지표의 변화로 감염 상태와 치료 효과를 객관적으로 파악할 수 있다.'})
    ther = @(
        @{plan='처방에 따라 해열제와 항생제를 투여한다.';why='해열제는 시상하부의 체온 설정점을 낮추고, 항생제는 고체온의 원인인 감염을 치료한다.'},
        @{plan='금기가 아닐 시 수분 섭취를 격려한다.';why='발열로 증가한 수분 손실을 보충하여 탈수를 예방한다.'},
        @{plan='미온수 마사지를 시행하고 얇은 옷과 이불을 제공한다.';why='전도와 증발을 통해 열 발산을 촉진한다. 오한 시에는 떨림으로 열 생산이 증가하므로 보온 후 시행한다.'},
        @{plan='실내 온도와 습도를 적절히 유지한다.';why='쾌적한 환경은 열 발산을 돕고 대상자의 안위를 증진한다.'})
    edu = @(
        @{plan='대상자와 보호자에게 발열 시 대처 방법과 수분 섭취의 중요성을 교육한다.';why='스스로 증상을 관리하고 탈수를 예방할 수 있게 한다.'},
        @{plan='체온이 38.5℃ 이상이거나 오한이 심하면 알리도록 교육한다.';why='급격한 체온 상승은 감염 악화의 징후일 수 있어 조기 대처가 필요하다.'})
}
'감염의 위험' = @{
    en = 'Risk for infection'
    domain = '11. 안전/보호 Safety/Protection'
    cls = '1. 감염 Infection'
    page = 23
    problem = '감염 위험'
    priority = 5
    reason = '아직 나타나지 않은 위험 진단이므로 실제적 진단보다 우선순위가 낮지만, 안전 요구로서 예방이 필요하다'
    evalData = 'WBC·CRP 추이, 체온, 침습 부위의 발적·부종·분비물, 감염 예방 방법 설명 여부'
    keywords = 'WBC|CRP|ESR|염증|감염|infection|수술|incision|절개|카테터|catheter|Foley|\bIV\b|정맥|드레인|drain|상처|wound'
    cause = '침습적 처치'
    long = '대상자는 퇴원 시까지 감염 증상 없이 지낼 것이다.'
    short = @('대상자는 1주일 내 WBC가 정상 범위(4,000~10,000/㎕)로 회복될 것이다.','대상자는 2일 내 감염 예방 방법을 두 가지 이상 말로 표현할 것이다.')
    diag = @(
        @{plan='매 듀티마다 감염 징후(발적, 열감, 부종, 통증, 분비물, 발열)를 사정한다.';why='감염의 국소·전신 징후를 조기에 발견하면 빠르게 치료할 수 있다.'},
        @{plan='WBC, CRP, 배양 검사 결과를 확인한다.';why='염증 지표는 감염 여부와 진행 정도를 객관적으로 나타낸다.'},
        @{plan='침습적 기구(정맥 주사 부위, 카테터, 배액관)의 삽입 부위를 사정한다.';why='침습적 기구는 미생물의 침입 경로가 되므로 정기적인 확인이 필요하다.'})
    ther = @(
        @{plan='처치 전후 손 위생을 철저히 하고 무균술을 지킨다.';why='손 위생과 무균술은 교차 감염을 예방하는 가장 기본적이고 효과적인 방법이다.'},
        @{plan='처방에 따라 항생제를 정해진 시간에 투여한다.';why='일정한 혈중 농도를 유지해야 항균 효과가 지속되고 내성 발생이 줄어든다.'},
        @{plan='드레싱과 침습적 기구를 병원 지침에 따라 관리한다.';why='오염된 드레싱과 장기 거치 기구는 감염 위험을 높인다.'},
        @{plan='적절한 영양과 수분 섭취를 격려한다.';why='단백질과 영양 공급은 면역 기능과 상처 치유를 돕는다.'})
    edu = @(
        @{plan='대상자와 보호자에게 손 씻기 방법과 감염 징후를 교육한다.';why='대상자의 참여로 감염 예방 효과를 높이고 이상 징후를 조기에 알릴 수 있다.'},
        @{plan='상처나 삽입 부위를 만지지 않도록 교육한다.';why='손을 통한 미생물 전파를 막는다.'})
}
'불충분한 체액량' = @{
    en = 'Inadequate fluid volume'
    domain = '2. 영양 Nutrition'
    cls = '5. 수화 Hydration'
    page = 17
    problem = '탈수'
    priority = 2
    reason = '순환과 생명 유지에 직결되는 생리적 문제로 빨리 교정하지 않으면 쇼크로 진행할 수 있다'
    evalData = '시간당 소변량, I/O, 체중, 피부 탄력·점막 상태, V/S, 전해질·BUN 결과'
    keywords = '탈수|dehydration|출혈량|실혈|출혈|hemorrhage|\bPPH\b|저혈압|빈맥|구토|vomit|설사|diarrhea|못 ?마시|수분 ?섭취 ?저하|소변량 ?감소|핍뇨|oliguria|점막 ?건조|피부 ?탄력|turgor|갈증|BUN|Hct|NPO|금식'
    cause = '구토와 설사로 인한 수분 손실'
    long = '대상자는 퇴원 시 적절한 체액 균형을 유지할 것이다.'
    short = @('대상자는 2일 내 시간당 소변량이 0.5mL/kg 이상 유지될 것이다.','대상자는 3일 내 피부 탄력과 점막 상태가 정상으로 회복될 것이다.')
    diag = @(
        @{plan='매 듀티마다 섭취량과 배설량(I/O)을 측정한다.';why='체액 균형 상태를 객관적으로 평가할 수 있다.'},
        @{plan='매일 같은 시간, 같은 조건에서 체중을 측정한다.';why='체중 1kg의 변화는 약 1L의 체액 변화를 의미한다.'},
        @{plan='V/S와 탈수 징후(피부 탄력, 점막 건조, 대천문 함몰-영아)를 사정한다.';why='탈수 시 빈맥, 저혈압, 피부 탄력 저하가 나타난다.'},
        @{plan='전해질, BUN/Cr, Hct 검사 결과를 확인한다.';why='체액 부족 시 혈액 농축으로 BUN, Hct가 상승하고 전해질 불균형이 생길 수 있다.'})
    ther = @(
        @{plan='처방에 따라 수액을 정확한 속도로 주입한다.';why='손실된 체액과 전해질을 보충하며, 과다 주입은 체액 과다를 유발할 수 있다.'},
        @{plan='금기가 아닐 시 경구 수분 섭취를 조금씩 자주 격려한다.';why='소량씩 자주 섭취하면 구토를 줄이면서 수분을 보충할 수 있다.'},
        @{plan='처방에 따라 진토제·지사제를 투여한다.';why='체액 손실의 원인을 줄인다.'},
        @{plan='구강 간호를 제공한다.';why='점막 건조로 인한 불편감과 구강 감염을 예방한다.'})
    edu = @(
        @{plan='대상자와 보호자에게 탈수 징후와 수분 섭취 방법을 교육한다.';why='퇴원 후에도 탈수를 조기에 발견하고 예방할 수 있다.'},
        @{plan='섭취량과 배설량 기록 방법을 교육한다.';why='대상자와 보호자의 참여로 정확한 I/O 측정이 가능하다.'})
}
'과도한 불안' = @{
    en = 'Excessive anxiety'
    domain = '9. 대처/스트레스 내성 Coping/Stress tolerance'
    cls = '2. 대처반응 Coping responses'
    page = 22
    problem = '불안'
    priority = 6
    reason = '심리·정서적 요구로, 생명과 직결된 생리적 요구가 해결된 뒤 다룬다'
    evalData = '불안 점수(VAS), 언어적·비언어적 불안 표현, V/S, 수면 양상, 불안 감소 방법 수행 여부'
    keywords = '불안|걱정|무서|두려|긴장|초조|anxiety|잠을 못|떨려|수술 전|pre ?op|낯선'
    cause = '질병과 치료 과정에 대한 지식 부족'
    long = '대상자는 퇴원 시 불안이 감소되었음을 말로 표현할 것이다.'
    short = @('대상자는 3일 내 불안 점수(VAS)가 3점 이하로 감소될 것이다.','대상자는 2일 내 불안 감소 방법을 한 가지 이상 수행할 것이다.')
    diag = @(
        @{plan='매 듀티마다 불안의 정도와 언어적·비언어적 표현을 사정한다.';why='불안 수준을 파악해야 그에 맞는 중재를 선택할 수 있다.'},
        @{plan='불안을 유발하는 요인을 사정한다.';why='원인을 알면 원인에 맞는 중재를 할 수 있다.'},
        @{plan='V/S와 수면 양상을 사정한다.';why='불안은 교감신경을 자극해 맥박·혈압 상승과 수면 장애를 일으킨다.'})
    ther = @(
        @{plan='치료적 의사소통으로 감정 표현을 격려하고 경청한다.';why='감정을 표현하면 긴장이 해소되고 신뢰 관계가 형성된다.'},
        @{plan='조용하고 안정된 환경을 제공한다.';why='외부 자극을 줄이면 불안이 감소한다.'},
        @{plan='심호흡, 이완요법 등을 함께 시행한다.';why='이완요법은 부교감신경을 활성화해 불안을 감소시킨다.'},
        @{plan='보호자의 면회와 지지를 격려한다.';why='가족의 정서적 지지는 불안을 줄이는 중요한 자원이다.'})
    edu = @(
        @{plan='대상자에게 질병, 검사, 치료 과정을 이해하기 쉽게 설명한다.';why='모르는 상황에 대한 두려움이 줄어들어 불안이 감소한다.'},
        @{plan='불안 감소 방법(심호흡, 음악, 이완)을 교육한다.';why='스스로 불안을 조절할 수 있게 한다.'})
}
'비효과적 호흡양상' = @{
    en = 'Ineffective breathing pattern'
    domain = '4. 활동/휴식 Activity/Rest'
    cls = '4. 심혈관/호흡기계 반응 Cardiovascular/Pulmonary responses'
    page = 18
    problem = '호흡 양상 변화'
    priority = 1
    reason = '기도·호흡 문제(ABC 원칙의 A·B)로 생명에 직접 영향을 줄 수 있어 가장 먼저 해결해야 한다'
    evalData = '호흡수·깊이·양상, SpO2, 보조근 사용, 청색증 여부'
    keywords = '호흡곤란|숨이 ?차|숨쉬기|dyspnea|SpO2|산소포화도|\bRR\b|빈호흡|tachypnea|함몰호흡|retraction|천식|asthma|COPD|산소 ?투여'
    cause = '폐 확장 감소'
    long = '대상자는 퇴원 시 호흡곤란 없이 정상 호흡 양상을 유지할 것이다.'
    short = @('대상자는 2일 내 SpO2가 95% 이상 유지될 것이다.','대상자는 3일 내 호흡수가 정상 범위로 유지될 것이다.')
    diag = @(
        @{plan='매 2~4시간마다 호흡수, 깊이, 양상, SpO2를 사정한다.';why='호흡 상태 변화를 조기에 발견하여 저산소증을 예방할 수 있다.'},
        @{plan='호흡음을 청진하고 객담의 양상(양, 색, 점도)을 사정한다.';why='비정상 호흡음과 객담 양상은 기도 폐쇄나 감염 정도를 나타낸다.'},
        @{plan='청색증, 보조근 사용, 의식 변화를 관찰한다.';why='저산소증의 진행을 나타내는 징후이다.'})
    ther = @(
        @{plan='반좌위(Fowler 자세)를 취하게 한다.';why='횡격막이 내려가 폐 확장이 쉬워지고 호흡 노력이 줄어든다.'},
        @{plan='처방에 따라 산소를 투여한다.';why='저산소증을 교정하고 조직의 산소 공급을 유지한다.'},
        @{plan='심호흡과 기침을 격려하고 필요 시 흡인한다.';why='분비물을 배출하여 기도 개방성을 유지한다.'},
        @{plan='금기가 아닐 시 수분 섭취를 격려하고 처방에 따라 네뷸라이저를 적용한다.';why='분비물을 묽게 하여 배출을 쉽게 한다.'})
    edu = @(
        @{plan='효과적인 기침과 심호흡 방법을 교육한다.';why='스스로 분비물을 배출하고 폐 확장을 증진할 수 있다.'},
        @{plan='호흡곤란이 심해지면 즉시 알리도록 교육한다.';why='급격한 호흡 상태 악화에 빠르게 대처할 수 있다.'})
}
'불충분한 영양섭취' = @{
    en = 'Inadequate nutritional intake'
    domain = '2. 영양 Nutrition'
    cls = '1. 섭취 Ingestion'
    page = 16
    problem = '영양 섭취 부족'
    priority = 4
    reason = '생리적 요구이지만 즉각적인 생명 위협은 적어 급성 문제를 해결한 뒤 다룬다'
    evalData = '매 끼니 섭취량(%), 체중, 알부민·단백질 수치'
    keywords = '식욕|식사량|먹지 ?못|체중 ?감소|weight loss|알부민|albumin|오심|nausea|저체중|영양|섭취 ?부족'
    cause = '식욕부진'
    long = '대상자는 퇴원 시 처방된 식이를 80% 이상 섭취할 것이다.'
    short = @('대상자는 3일 내 매 끼니 식사량의 50% 이상을 섭취할 것이다.','대상자는 1주일 내 체중이 더 이상 감소하지 않을 것이다.')
    diag = @(
        @{plan='매 끼니 식사 섭취량을 확인한다.';why='섭취량을 객관적으로 파악해 영양 상태를 평가한다.'},
        @{plan='주 2~3회 같은 조건에서 체중을 측정한다.';why='체중 변화는 영양 상태의 객관적 지표이다.'},
        @{plan='알부민, 단백질, Hb 등 검사 결과를 확인한다.';why='혈청 단백 수치는 영양 결핍 정도를 나타낸다.'})
    ther = @(
        @{plan='소량씩 자주 먹도록 하고 대상자가 선호하는 음식을 제공한다.';why='위 팽만과 오심을 줄이고 섭취량을 늘린다.'},
        @{plan='식사 전 구강 간호를 제공하고 쾌적한 식사 환경을 만든다.';why='구강 청결과 쾌적한 환경은 식욕을 증진한다.'},
        @{plan='필요 시 영양사와 협의하고 처방에 따라 영양 보충을 시행한다.';why='개인 요구에 맞는 영양 공급으로 결핍을 교정한다.'})
    edu = @(
        @{plan='균형 잡힌 식이와 단백질 섭취의 중요성을 교육한다.';why='회복과 상처 치유에 필요한 영양을 스스로 관리할 수 있다.'})
}
'성인 낙상의 위험' = @{
    en = 'Risk for adult falls'
    domain = '11. 안전/보호 Safety/Protection'
    cls = '2. 신체적 손상 Physical injury'
    page = 24
    problem = '낙상 위험'
    priority = 5
    reason = '아직 일어나지 않은 위험 진단이지만 낙상은 심각한 손상을 일으키므로 안전 요구로서 예방이 필요하다'
    evalData = '낙상 위험 평가 점수(Morse 등), 낙상 발생 여부, 이동 시 도움 요청 여부'
    keywords = '낙상|\bfalls?\b|어지러|어지럼|현기증|dizz|보행|휠체어|진정제|수면제|고령|노인|근력 ?저하'
    cause = '어지러움과 근력 저하'
    long = '대상자는 퇴원 시까지 낙상 없이 지낼 것이다.'
    short = @('대상자는 1일 내 낙상 예방 수칙을 두 가지 이상 말로 표현할 것이다.','대상자는 입원 기간 동안 이동 시 도움을 요청할 것이다.')
    diag = @(
        @{plan='입원 시와 매 듀티마다 낙상 위험 평가도구(Morse 등)로 사정한다.';why='위험 정도를 객관적으로 파악하여 맞춤형 예방 중재를 할 수 있다.'},
        @{plan='낙상 위험 약물(진정제, 이뇨제, 항고혈압제) 투여 여부를 확인한다.';why='이들 약물은 어지러움, 기립성 저혈압을 유발해 낙상 위험을 높인다.'})
    ther = @(
        @{plan='침대 높이를 낮추고 바퀴를 고정하며 침상 난간을 올린다.';why='낙상 시 손상을 줄이고 낙상 자체를 예방한다.'},
        @{plan='호출벨과 필요한 물건을 손이 닿는 곳에 둔다.';why='무리하게 혼자 움직이는 것을 막는다.'},
        @{plan='미끄럼 방지 신발을 착용하게 하고 바닥을 건조하게 유지한다.';why='미끄러짐으로 인한 낙상을 예방한다.'},
        @{plan='체위 변경 시 천천히 일어나도록 돕는다.';why='기립성 저혈압으로 인한 어지러움과 낙상을 예방한다.'})
    edu = @(
        @{plan='대상자와 보호자에게 낙상 예방 수칙을 교육한다.';why='대상자와 보호자가 함께 참여해야 낙상 예방 효과가 높아진다.'})
}
'불충분한 건강지식' = @{
    en = 'Inadequate health knowledge'
    domain = '5. 지각/인지 Perception/Cognition'
    cls = '4. 인지 Cognition'
    page = 19
    problem = '건강지식 부족'
    priority = 7
    reason = '교육으로 해결할 수 있는 문제로, 급성 문제가 안정된 뒤 다루는 것이 효과적이다'
    evalData = '질병·관리 방법을 말로 설명하는지(teach-back), 교육 내용 실천 여부'
    keywords = '모르겠|몰라|어떻게 ?해야|궁금|처음|교육|이해 ?못|질문'
    cause = '질병과 치료에 대한 정보 부족'
    long = '대상자는 퇴원 시 질병 관리 방법을 정확히 말로 표현할 것이다.'
    short = @('대상자는 2일 내 질병의 원인과 증상을 두 가지 이상 말로 표현할 것이다.','대상자는 3일 내 퇴원 후 주의사항을 두 가지 이상 말로 표현할 것이다.')
    diag = @(
        @{plan='대상자의 현재 지식 수준과 학습 요구를 사정한다.';why='수준에 맞는 교육 내용과 방법을 정할 수 있다.'},
        @{plan='학습을 방해하는 요인(통증, 불안, 피로, 언어)을 사정한다.';why='학습 준비가 되어야 교육 효과가 높다.'})
    ther = @(
        @{plan='대상자가 편안할 때 짧고 반복적으로 설명한다.';why='짧고 반복적인 교육은 기억과 이해를 높인다.'},
        @{plan='그림, 팸플릿 등 시청각 자료를 활용한다.';why='다양한 감각을 활용하면 이해와 기억이 쉬워진다.'})
    edu = @(
        @{plan='질병의 원인, 증상, 치료 과정과 퇴원 후 관리 방법을 교육한다.';why='스스로 건강을 관리하고 재발을 예방할 수 있다.'},
        @{plan='교육 후 대상자가 다시 설명하게 하여(teach-back) 이해 정도를 확인한다.';why='교육 효과를 평가하고 부족한 부분을 보완할 수 있다.'})
}
'비효과적 수면양상' = @{
    en = 'Ineffective sleep pattern'
    domain = '4. 활동/휴식 Activity/Rest'
    cls = '1. 수면/휴식 Sleep/Rest'
    page = 17
    problem = '수면 문제'
    priority = 4
    reason = '휴식 요구로 회복에 영향을 주지만 즉각적인 생명 위협은 적다'
    evalData = '야간 수면 시간, 깨는 횟수, 수면의 질에 대한 표현'
    keywords = '잠을|못 ?자|불면|insomnia|자주 ?깨|수면|피곤|밤에'
    cause = '통증과 낯선 병원 환경'
    long = '대상자는 퇴원 시 충분한 수면을 취했다고 말로 표현할 것이다.'
    short = @('대상자는 3일 내 밤에 6시간 이상 수면을 취할 것이다.','대상자는 2일 내 수면을 돕는 방법을 한 가지 이상 수행할 것이다.')
    diag = @(
        @{plan='수면 시간, 깨는 횟수, 수면의 질을 사정한다.';why='수면 양상을 파악해 원인과 중재 효과를 평가한다.'},
        @{plan='수면을 방해하는 요인(통증, 소음, 처치, 불안)을 사정한다.';why='원인을 제거해야 수면을 개선할 수 있다.'})
    ther = @(
        @{plan='야간 처치를 모아서 시행하고 조명과 소음을 줄인다.';why='수면 방해를 최소화한다.'},
        @{plan='잠들기 전 통증을 조절하고 편안한 체위를 돕는다.';why='불편감이 줄면 잠들기 쉬워진다.'},
        @{plan='낮잠을 줄이고 규칙적인 수면 습관을 격려한다.';why='일주기 리듬을 유지해 야간 수면을 돕는다.'})
    edu = @(
        @{plan='수면 위생(카페인 제한, 규칙적인 기상 시간 등)을 교육한다.';why='스스로 수면의 질을 높일 수 있다.'})
}
'배변 장애' = @{
    en = 'Impaired intestinal elimination'
    domain = '3. 배설/교환 Elimination/Exchange'
    cls = '2. 위장관계 기능 Gastrointestinal function'
    page = 17
    problem = '배변 문제'
    priority = 4
    reason = '배설 요구로 불편감을 주지만 즉각적인 생명 위협은 적다'
    evalData = '배변 횟수·양·성상, 장음, 복부 팽만 여부, 수분 섭취량'
    keywords = '변비|constipation|배변 ?장애|배변 ?없|대변을 ?못|딱딱한 ?변|복부 ?팽만|가스|장음 ?감소'
    cause = '활동 감소와 수분 섭취 부족'
    long = '대상자는 퇴원 시 규칙적인 배변 양상을 유지할 것이다.'
    short = @('대상자는 3일 내 부드러운 변을 1회 이상 볼 것이다.','대상자는 2일 내 하루 수분 섭취량이 1,500mL 이상 유지될 것이다.')
    diag = @(
        @{plan='배변 횟수, 양, 성상과 마지막 배변일을 사정한다.';why='배변 양상을 파악해 변비 정도를 평가한다.'},
        @{plan='장음을 청진하고 복부 팽만을 사정한다.';why='장운동 상태와 장폐색 여부를 확인할 수 있다.'})
    ther = @(
        @{plan='금기가 아닐 시 수분과 섬유질 섭취를 격려한다.';why='변을 부드럽게 하고 장운동을 촉진한다.'},
        @{plan='금기가 아닐 시 조기 이상과 활동을 격려한다.';why='신체 활동은 장 연동운동을 증가시킨다.'},
        @{plan='처방에 따라 완하제를 투여한다.';why='장운동을 촉진하거나 변을 부드럽게 해 배변을 돕는다.'})
    edu = @(
        @{plan='변비 예방을 위한 식이, 수분, 운동의 중요성을 교육한다.';why='퇴원 후에도 규칙적인 배변을 유지할 수 있다.'})
}

'비효과적 기도청결' = @{
    en = 'Ineffective airway clearance'
    domain = '11. 안전/보호 Safety/Protection'
    cls = '2. 신체적 손상 Physical injury'
    page = 24
    problem = '기도 분비물'
    priority = 1
    reason = '기도 개방성 문제(ABC 원칙의 A)로 저산소증과 생명 위협으로 이어질 수 있어 가장 먼저 해결해야 한다'
    evalData = '호흡음(수포음·천명음), 객담 양상과 배출 여부, SpO2, 호흡수'
    keywords = '가래|객담|sputum|기침|cough|가르랑|수포음|crackle|rale|천명|wheez|흡인|suction|폐렴|pneumonia|모세기관지염|bronchiolitis|RSV'
    cause = '기도 분비물 증가'
    long = '대상자는 퇴원 시 기도 분비물 없이 깨끗한 호흡음을 유지할 것이다.'
    short = @('대상자는 2일 내 청진 시 수포음이 감소할 것이다.','대상자는 3일 내 효과적으로 기침하여 객담을 배출할 것이다.')
    diag = @(
        @{plan='매 4시간마다 호흡음을 청진하고 호흡수, SpO2를 사정한다.';why='비정상 호흡음과 SpO2 저하는 기도 분비물 축적과 저산소증을 나타낸다.'},
        @{plan='객담의 양, 색, 점도를 사정한다.';why='객담의 양상은 감염 여부와 기도 청결 정도를 나타낸다.'})
    ther = @(
        @{plan='반좌위를 취하게 하고 2시간마다 체위를 변경한다.';why='횡격막이 내려가 폐 확장이 쉬워지고, 체위 변경은 분비물 이동을 돕는다.'},
        @{plan='금기가 아닐 시 수분 섭취를 격려한다.';why='분비물을 묽게 하여 배출을 쉽게 한다.'},
        @{plan='처방에 따라 네뷸라이저를 적용하고 흉부물리요법(타진, 진동)을 시행한다.';why='기관지를 확장하고 분비물을 느슨하게 하여 배출을 돕는다.'},
        @{plan='필요 시 무균적으로 흡인한다.';why='스스로 배출하지 못하는 분비물을 제거하여 기도 개방성을 유지한다. 흡인 전후 산소화 상태를 확인한다.'})
    edu = @(
        @{plan='효과적인 기침과 심호흡 방법을 교육한다.';why='스스로 분비물을 배출하고 무기폐를 예방할 수 있다.'},
        @{plan='보호자에게 등 두드리기(타진)와 수분 섭취 방법을 교육한다.';why='보호자가 참여하면 퇴원 후에도 분비물 배출을 도울 수 있다.'})
}
'구강점막 통합성 손상' = @{
    en = 'Impaired oral mucous membrane integrity'
    domain = '11. 안전/보호 Safety/Protection'
    cls = '2. 신체적 손상 Physical injury'
    page = 24
    problem = '구강점막 손상'
    priority = 3
    reason = '입안 통증으로 먹고 마시지 못하게 하여 탈수·영양 문제로 이어질 수 있는 실제적 문제이다'
    evalData = '구강 병변의 수·크기, 구강 통증 표현, 섭취량, 침 흘림 여부'
    keywords = '구내염|stomatitis|입안|입 안|구강|수포|궤양|ulcer|침을 ?흘|수족구|hand-foot-and-mouth|HFMD|헤르판지나|herpangina|아구창'
    cause = '바이러스 감염에 의한 구강 내 수포'
    long = '대상자는 퇴원 시 구강점막 병변이 호전되어 통증 없이 식사할 것이다.'
    short = @('대상자는 3일 내 구강 통증을 호소하지 않을 것이다.','대상자는 2일 내 하루 수분 섭취량이 목표량 이상 유지될 것이다.')
    diag = @(
        @{plan='매 듀티마다 구강점막 상태(수포, 궤양, 발적, 출혈)를 사정한다.';why='병변의 진행과 회복 정도를 객관적으로 평가할 수 있다.'},
        @{plan='섭취량과 구강 통증 정도를 사정한다.';why='구강 통증은 섭취 저하와 탈수의 주요 원인이다.'})
    ther = @(
        @{plan='식후와 취침 전 미온수나 생리식염수로 부드럽게 구강 간호를 제공한다.';why='구강을 청결히 하여 2차 감염을 예방하고 점막 회복을 돕는다.'},
        @{plan='차갑고 부드러운 음식과 음료를 제공하고 맵거나 짜고 신 음식을 피한다.';why='자극을 줄여 통증을 감소시키고 섭취량을 늘린다.'},
        @{plan='처방에 따라 진통·해열제를 식사 전에 투여한다.';why='식사 시 통증을 줄여 섭취를 도울 수 있다.'})
    edu = @(
        @{plan='보호자에게 구강 간호 방법과 자극적인 음식을 피해야 하는 이유를 교육한다.';why='보호자가 직접 구강 간호를 하여 회복을 도울 수 있다.'},
        @{plan='손 씻기와 식기 분리 등 전파 예방 방법을 교육한다.';why='바이러스성 구강 질환은 접촉으로 쉽게 전파된다.'})
}
'아동 낙상의 위험' = @{
    en = 'Risk for child falls'
    domain = '11. 안전/보호 Safety/Protection'
    cls = '2. 신체적 손상 Physical injury'
    page = 24
    problem = '낙상 위험'
    priority = 5
    reason = '아직 일어나지 않은 위험 진단이지만 아동은 발달 특성상 낙상 위험이 높아 안전 요구로서 예방이 필요하다'
    evalData = '아동 낙상 위험 평가 점수(Humpty Dumpty 등), 낙상 발생 여부, 보호자의 낙상 예방 수칙 이행 여부'
    keywords = '낙상|\bfalls?\b|침대에서|기어|걸음마|보채|진정|수면제|어지러'
    cause = '아동의 발달 특성과 낯선 병원 환경'
    long = '대상자는 퇴원 시까지 낙상 없이 지낼 것이다.'
    short = @('보호자는 1일 내 낙상 예방 수칙을 두 가지 이상 말로 표현할 것이다.','대상자는 입원 기간 동안 침상 난간을 올린 상태를 유지할 것이다.')
    diag = @(
        @{plan='입원 시와 매 듀티마다 아동 낙상 위험 평가도구(Humpty Dumpty 등)로 사정한다.';why='위험 정도를 객관적으로 파악하여 맞춤형 예방 중재를 할 수 있다.'},
        @{plan='낙상 위험 약물(진정제, 해열·진통제 투여 후 졸림) 투여 여부를 확인한다.';why='약물에 의한 졸림과 어지러움은 낙상 위험을 높인다.'})
    ther = @(
        @{plan='침상 난간을 항상 올리고 침대 높이를 낮게 유지한다.';why='아동이 침대에서 떨어지는 것을 막는다.'},
        @{plan='보호자가 자리를 비울 때 간호사에게 알리도록 한다.';why='아동을 혼자 두는 시간을 줄여 낙상을 예방한다.'},
        @{plan='미끄럼 방지 신발을 신기고 바닥을 건조하게 유지한다.';why='미끄러짐으로 인한 낙상을 예방한다.'})
    edu = @(
        @{plan='보호자에게 낙상 예방 수칙(침상 난간 올리기, 아동 혼자 두지 않기)을 교육한다.';why='아동의 안전은 보호자의 참여가 있어야 효과적으로 지킬 수 있다.'})
}
}

function Get-Particle($word,$withBatchim,$without) {
    if(-not $word){return $without}
    $c=[int][char]$word[$word.Length-1]
    if($c -ge 0xAC00 -and $c -le 0xD7A3){if((($c-0xAC00)%28) -ne 0){return $withBatchim}else{return $without}}
    return $withBatchim
}
function Get-Ro($word) {
    if(-not $word){return '로'}
    $c=[int][char]$word[$word.Length-1]
    if($c -ge 0xAC00 -and $c -le 0xD7A3){$final=($c-0xAC00)%28;if($final -eq 0 -or $final -eq 8){return '로'}else{return '으로'}}
    return '으로'
}
function Format-Diagnosis($cause,$problem,$origin) {
    $text="$cause$(Get-Particle $cause '과' '와') 관련된 $problem"
    if($origin){$text="$origin$(Get-Ro $origin) 인한 $text"}
    return $text
}
# 계획 문장(~한다.)을 중재 문장(~하였다.)으로 바꾼다
function ConvertTo-Past($sentence) {
    $s=$sentence.Trim()
    foreach($pair in @(@('제공한다.','제공하였다.'),@('투여한다.','투여하였다.'),@('교육한다.','교육하였다.'),@('사정한다.','사정하였다.'),@('측정한다.','측정하였다.'),@('확인한다.','확인하였다.'),@('관찰한다.','관찰하였다.'),@('격려한다.','격려하였다.'),@('취하게 한다.','취하게 하였다.'),@('돕는다.','도왔다.'),@('둔다.','두었다.'),@('올린다.','올렸다.'),@('줄인다.','줄였다.'),@('만든다.','만들었다.'),@('설명한다.','설명하였다.'),@('지킨다.','지켰다.'),@('흡인한다.','흡인하였다.'))){
        if($s.EndsWith($pair[0])){return $s.Substring(0,$s.Length-$pair[0].Length)+$pair[1]}
    }
    if($s.EndsWith('한다.')){return $s.Substring(0,$s.Length-3)+'하였다.'}
    return $s
}
function Split-Lines($text) {
    return @(($text -split "(`r`n|`n|;)") | ForEach-Object {$_.Trim().TrimStart('-','·','•',' ').Trim()} | Where-Object {$_ -and $_ -notmatch '^(`r`n|`n|;)$'})
}
# 자료에서 관련 있는 간호진단을 찾아 점수 순으로 돌려준다
function Find-Diagnoses($subjective,$objective,$medical) {
    $all="$subjective`n$objective`n$medical"
    $scores=@()
    foreach($name in $script:Templates.Keys){
        $hits=[regex]::Matches($all,$script:Templates[$name].keywords,'IgnoreCase').Count
        if($hits -gt 0){$scores+=[pscustomobject]@{name=$name;score=$hits}}
    }
    return @($scores | Sort-Object score -Descending | ForEach-Object {$_.name})
}
function Get-Nrs($text) {
    $m=[regex]::Match($text,'NRS\s*[:：]?\s*(\d{1,2})','IgnoreCase')
    if($m.Success){return [int]$m.Groups[1].Value}
    return $null
}

# 간호과정 전체 틀을 만든다. $choices: @(@{name=;cause=;origin=}) 우선순위 순서
function New-NursingProcess($subjective,$objective,$medical,$choices,[datetime]$date) {
    $sb=New-Object Text.StringBuilder
    $line={param($t) [void]$sb.AppendLine($t)}
    $md=$date.ToString('M/d',[Globalization.CultureInfo]::InvariantCulture)
    & $line '■ 사정'
    & $line ''
    & $line '주관적 자료'
    $sLines=Split-Lines $subjective
    if($sLines.Count -eq 0){& $line '- "(대상자가 직접 한 말을 그대로 적으세요)"'}
    foreach($s in $sLines){if($s.StartsWith('"') -or $s.StartsWith('“')){& $line "- $s"}else{& $line "- `"$s`""}}
    & $line ''
    & $line '객관적 자료'
    $oLines=Split-Lines $objective
    if($oLines.Count -eq 0){& $line '- (V/S, 검사 결과, 관찰 내용, 이미 투여된 약물을 적으세요)'}
    foreach($o in $oLines){& $line "- $o"}
    if($medical){foreach($d in Split-Lines $medical){if($d -match '^Dx'){& $line "- $d"}else{& $line "- Dx. $d"}}}
    & $line ''
    & $line '■ 진단'
    & $line ''
    $n=0
    foreach($choice in $choices){$n++;& $line "진단 $n : $(Format-Diagnosis $choice.cause $choice.name $choice.origin)"}
    $nrs=Get-Nrs $objective
    $n=0
    foreach($choice in $choices){
        $n++;$t=$script:Templates[$choice.name]
        $title=Format-Diagnosis $choice.cause $choice.name $choice.origin
        & $line ''
        & $line '────────────────────────────'
        & $line "진단 $n : $title"
        & $line '────────────────────────────'
        & $line ''
        & $line '■ 계획'
        & $line ''
        & $line '장기목표'
        & $line $t.long
        & $line ''
        & $line '단기목표'
        $goalNrs=if($nrs -ne $null){[Math]::Max(0,[Math]::Min(2,$nrs-3))}else{2}
        $i=0;foreach($g in $t.short){$i++;& $line "$i. $($g.Replace('{nrsGoal}',[string]$goalNrs))"}
        foreach($section in @(@('진단적 계획','diag'),@('치료적 계획','ther'),@('교육적 계획','edu'))){
            & $line '';& $line $section[0]
            $i=0;foreach($p in $t[$section[1]]){$i++;& $line "$i. $($p.plan)";& $line " 이론적 근거 : $($p.why)"}
        }
        & $line ''
        & $line '■ 중재'
        foreach($section in @(@('진단적 중재','diag'),@('치료적 중재','ther'),@('교육적 중재','edu'))){
            & $line '';& $line $section[0]
            $i=0;foreach($p in $t[$section[1]]){$i++;& $line "$i. $(ConvertTo-Past $p.plan)";& $line " $md __:__ (수행한 내용과 대상자의 반응을 적으세요)"}
        }
        & $line ''
        & $line '■ 평가'
        & $line ''
        & $line '단기목표 평가'
        $i=0;foreach($g in $t.short){$i++;& $line "$i. 대상자는 __/__ (결과를 수치로 적으세요) 이므로 단기목표 $i  달성 / 부분적 달성 / 달성 못함."}
        & $line ''
        & $line '장기목표 평가'
        & $line '대상자는 __/__ (퇴원 시 상태) 이므로 장기목표  달성 / 부분적 달성 / 달성 못함.'
        & $line ' ※ 부분적 달성하거나 달성하지 못한 목표는 수정하여 다시 중재한다.'
    }
    & $line ''
    & $line '※ 자동으로 만든 틀입니다. 이론적 근거와 수치는 교재와 대상자 자료로 꼭 확인·수정하세요.'
    return $sb.ToString()
}

# ---------- B4 워크북 형식 (간호과정 별책 워크북 순서) ----------
function Get-Topic($word){return "$word$(Get-Particle $word '은' '는')"}
function Sort-ByPriority($choices){
    $i=0;return @($choices | ForEach-Object {$i++;[pscustomobject]@{c=$_;p=$script:Templates[$_.name].priority;i=$i}} | Sort-Object p,i | ForEach-Object {$_.c})
}
# 자료 한 줄이 어느 진단의 단서인지 찾는다
function Get-Clusters($lines,$choices){
    $clusters=@{}
    foreach($c in $choices){$clusters[$c.name]=@()}
    foreach($l in $lines){foreach($c in $choices){if($l -match $script:Templates[$c.name].keywords){$clusters[$c.name]+=$l}}}
    return $clusters
}
function New-WorkbookModel($subjective,$objective,$medical,$choices,[datetime]$date,[bool]$autoSort=$false){
    if($autoSort){$choices=Sort-ByPriority $choices}
    $sLines=@(Split-Lines $subjective | ForEach-Object {if($_ -match '^["“]'){$_}else{"`"$_`""}})
    $oLines=@(Split-Lines $objective)
    $dx=@(Split-Lines $medical | ForEach-Object {if($_ -match '^Dx'){$_}else{"Dx. $_"}})
    $all=@($sLines)+@($oLines)+@($dx)
    $clusters=Get-Clusters $all $choices
    $nrs=Get-Nrs $objective
    $diags=@()
    foreach($c in $choices){
        $t=$script:Templates[$c.name]
        $goalNrs=if($nrs -ne $null){[Math]::Max(0,[Math]::Min(2,$nrs-3))}else{2}
        $short=@($t.short | ForEach-Object {$_.Replace('{nrsGoal}',[string]$goalNrs)})
        $plans=@()
        foreach($kind in @(@('진단적','diag'),@('치료적','ther'),@('교육적','edu'))){foreach($pl in $t[$kind[1]]){$plans+=[pscustomobject]@{kind=$kind[0];plan=$pl.plan;why=$pl.why;done=(ConvertTo-Past $pl.plan)}}}
        $cause=if($c.origin){"$($c.origin)$(Get-Ro $c.origin) 인한 $($c.cause)"}else{$c.cause}
        $diags+=[pscustomobject]@{name=$c.name;en=$t.en;domain=$t.domain;cls=$t.cls;page=$t.page;problem=$t.problem;reason=$t.reason;
            statement=(Format-Diagnosis $c.cause $c.name $c.origin);cause=$cause;cues=@($clusters[$c.name]);long=$t.long;short=$short;plans=$plans;evalData=$t.evalData}
    }
    $domains=[ordered]@{}
    foreach($d in $diags){if(-not $domains.Contains($d.domain)){$domains[$d.domain]=@()};foreach($q in $d.cues){if($q -notin $domains[$d.domain]){$domains[$d.domain]+=$q}}}
    $priority=''
    if($diags.Count -gt 0){
        $parts=@();$n=0;foreach($d in $diags){$n++;$parts+="${n}순위 '$($d.name)'$(Get-Particle $d.name '은' '는') $($d.reason)."}
        $priority=($parts -join ' ')+' 매슬로우의 욕구 단계와 ABC(기도·호흡·순환) 원칙, 실제적 진단을 위험 진단보다 먼저 다루는 원칙에 따라 정하였다.'
    }
    return [pscustomobject]@{date=$date;subjective=$sLines;objective=@($oLines)+@($dx);domains=$domains;diags=$diags;priority=$priority}
}
function ConvertTo-WorkbookText($m){
    $sb=New-Object Text.StringBuilder;$w={param($x) [void]$sb.AppendLine($x)}
    $md=$m.date.ToString('M/d',[Globalization.CultureInfo]::InvariantCulture)
    & $w '■ 1. 간호사정';& $w ''
    & $w '주관적 자료';$i=0;foreach($x in $m.subjective){$i++;& $w "$i. $x"};if($i -eq 0){& $w '1. "(대상자가 직접 한 말)"'}
    & $w '';& $w '객관적 자료';$i=0;foreach($x in $m.objective){$i++;& $w "$i. $x"};if($i -eq 0){& $w '1. (V/S, 검사 결과, 관찰 내용, 투여된 약물)'}
    & $w '';& $w '자료조직(분류) · NANDA-I 분류체계 기준'
    foreach($k in $m.domains.Keys){$v=@($m.domains[$k]);& $w "▪ $k 영역에 해당하는 자료: $(if($v.Count){$v -join ', '}else{'(해당 자료를 적으세요)'})"}
    & $w '';& $w '간호문제';$i=0;foreach($d in $m.diags){$i++;& $w "$i. $($d.problem)"}
    & $w '';& $w '■ 2. 간호진단'
    $n=0;foreach($d in $m.diags){$n++
        & $w '';& $w "단서묶음 $n"
        $i=0;foreach($q in $d.cues){$i++;& $w "$i. $q"};if($i -eq 0){& $w '1. (이 진단의 근거가 되는 자료를 적으세요)'}
        & $w "▪ 영역: $($d.domain)";& $w "▪ 과: $($d.cls)";& $w "▪ 페이지: 별책 부록 8, p.$($d.page)"
        & $w "▪ 진단명: $($d.name) ($($d.en))";& $w "▪ 정의: (별책 부록 8, p.$($d.page)의 정의를 옮겨 적으세요)"
        & $w "관련(위험) 요인: $($d.cause)";& $w "간호진단 진술: $($d.statement)"
    }
    & $w '';& $w '■ 3. 간호계획';& $w ''
    $n=0;foreach($d in $m.diags){$n++;& $w "${n}순위: $($d.statement)"}
    & $w "우선순위의 근거: $($m.priority)"
    $n=0;foreach($d in $m.diags){$n++
        & $w '';& $w "간호진단 $n : $($d.statement)"
        & $w "▪ 장기목표 : $($d.long)";& $w '▪ 단기목표 :';$i=0;foreach($g in $d.short){$i++;& $w "  $i) $g"}
        & $w '간호중재 | 이론적 근거';$i=0;foreach($p in $d.plans){$i++;& $w "$i. [$($p.kind)] $($p.plan)";& $w "   → 이론적 근거 : $($p.why)"}
    }
    & $w '';& $w '■ 4. 간호수행 및 평가'
    $n=0;foreach($d in $m.diags){$n++
        & $w '';& $w "간호진단 $n : $($d.statement)"
        & $w "▪ 장기목표 : $($d.long)";$i=0;foreach($g in $d.short){$i++;& $w "▪ 단기목표 $i : $g"}
        & $w '간호수행';$i=0;foreach($p in $d.plans){$i++;& $w "$i. $md __:__ $($p.done) (대상자 반응: )"}
        & $w "간호평가를 위한 자료수집: $($d.evalData)"
        & $w '간호평가 진술문:';$i=0;foreach($g in $d.short){$i++;& $w "  단기목표 $i : 대상자는 __/__ (결과 수치) 이므로 달성 / 부분적 달성 / 달성 못함."}
        & $w '  장기목표 : 대상자는 __/__ (퇴원 시 상태) 이므로 달성 / 부분적 달성 / 달성 못함.'
    }
    & $w '';& $w '■ 5. 간호기록 (SOAPIE)'
    foreach($r in Get-SoapieRows $m){$head=if($r.dx){"$($r.date) $($r.time) [$($r.dx)]"}elseif($r.time){"      $($r.time)"}else{'      '};& $w "$head  $($r.tag) : $($r.text)"}
    & $w '';& $w '※ 자동으로 만든 틀입니다. 정의는 별책 부록 8을, 이론적 근거와 수치는 교재와 대상자 자료로 꼭 확인·수정하세요.'
    return $sb.ToString()
}
function Get-SoapieRows($m){
    $rows=@();if($m.diags.Count -eq 0){return $rows}
    $d=$m.diags[0];$md=$m.date.ToString('M/d',[Globalization.CultureInfo]::InvariantCulture)
    $s=@($m.subjective|Where-Object {$_ -in $d.cues});if($s.Count -eq 0){$s=@('(이 진단과 관련된 대상자의 호소를 적으세요)')}
    $o=@($d.cues|Where-Object {$_ -notin $m.subjective});if($o.Count -eq 0){$o=@($m.objective)}
    $ther=@($d.plans|Where-Object {$_.kind -ne '진단적'}|Select-Object -First 3|ForEach-Object {$_.done})
    $rows+=[pscustomobject]@{date=$md;time='__:__';dx=$d.name;tag='S';text=($s -join ' ')}
    $rows+=[pscustomobject]@{date='';time='';dx='';tag='O';text=($o -join ', ')}
    $rows+=[pscustomobject]@{date='';time='';dx='';tag='A';text=$d.statement}
    $rows+=[pscustomobject]@{date='';time='';dx='';tag='P';text=$d.short[0]}
    $rows+=[pscustomobject]@{date='';time='';dx='';tag='I';text=($ther -join ' ')}
    $rows+=[pscustomobject]@{date='';time='__:__';dx='';tag='E';text='(중재 후 대상자 반응을 수치로 적으세요)'}
    return $rows
}
# Word(.doc)·한글·브라우저에서 열리는 B4 가로 표 양식
function ConvertTo-WorkbookHtml($m){
    $e={param($x) [System.Net.WebUtility]::HtmlEncode([string]$x)}
    $list={param($items,$empty) $i=0;$o='';foreach($x in $items){$i++;$o+="$i. $(& $e $x)<br>"};if($i -eq 0){$o="<span class=hint>$(& $e $empty)</span>"};$o}
    $md=$m.date.ToString('M/d',[Globalization.CultureInfo]::InvariantCulture)
    $h=New-Object Text.StringBuilder;$a={param($x) [void]$h.Append($x)}
    & $a @'
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>간호과정 워크북</title>
<style>
@page Section1{size:364mm 257mm;mso-page-orientation:landscape;margin:14mm 16mm}
div.Section1{page:Section1}
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:10pt;color:#1d1d1f}
h1{font-size:15pt;color:#0a7f8c;border-bottom:2px solid #0a9fb0;padding-bottom:3pt;margin:14pt 0 8pt}
h2{font-size:11.5pt;margin:10pt 0 4pt}
table{border-collapse:collapse;width:100%;margin-bottom:10pt}
td,th{border:1px solid #9fd6dd;padding:5pt 7pt;vertical-align:top}
th{background:#12a7b8;color:#fff;font-weight:bold;text-align:center}
td.k{background:#12a7b8;color:#fff;font-weight:bold;width:15%;text-align:center;vertical-align:middle}
.hint{color:#e08600}.blank{color:#e08600}.small{font-size:8.5pt;color:#6e6e73}
.pb{page-break-before:always}
</style></head><body><div class=Section1>
'@
    & $a '<h1>1. 간호사정</h1><table>'
    & $a "<tr><td class=k>주관적 자료</td><td>$(& $list $m.subjective '(대상자가 직접 한 말)')</td></tr>"
    & $a "<tr><td class=k>객관적 자료</td><td>$(& $list $m.objective '(V/S, 검사 결과, 관찰 내용, 투여된 약물)')</td></tr>"
    $org='';foreach($k in $m.domains.Keys){$v=@($m.domains[$k]);$org+="▪ <b>$(& $e $k)</b> 영역에 해당하는 자료: $(if($v.Count){& $e ($v -join ', ')}else{'<span class=hint>(해당 자료)</span>'})<br>"}
    & $a "<tr><td class=k>자료조직(분류)</td><td><span class=small>NANDA-I 간호진단 분류체계를 기틀로 조직</span><br>$org</td></tr>"
    & $a "<tr><td class=k>간호문제</td><td>$(& $list @($m.diags|ForEach-Object {$_.problem}) '')</td></tr></table>"
    & $a '<h1 class=pb>2. 간호진단</h1>'
    for($k=0;$k -lt $m.diags.Count;$k+=2){
        $pair=@($m.diags[$k..([Math]::Min($k+1,$m.diags.Count-1))])
        & $a '<table><tr><th style="width:15%"></th>';$n=$k;foreach($d in $pair){$n++;& $a "<th>단서묶음 $n</th>"};& $a '</tr>'
        $row={param($label,$cell) & $a "<tr><td class=k>$label</td>";foreach($d in $pair){& $a "<td>$(& $cell $d)</td>"};& $a '</tr>'}
        & $row '단서묶음' {param($d) & $list $d.cues '(근거 자료)'}
        & $row '영역찾기' {param($d) "▪ 영역: $(& $e $d.domain)<br>▪ 과: $(& $e $d.cls)<br>▪ 페이지: 별책 부록 8, p.$($d.page)"}
        & $row '간호진단명과 정의' {param($d) "▪ 진단명: <b>$(& $e $d.name)</b> ($(& $e $d.en))<br>▪ 정의: <span class=hint>(부록 8, p.$($d.page)의 정의를 옮겨 적으세요)</span>"}
        & $row '관련(위험) 요인' {param($d) & $e $d.cause}
        & $row '간호진단 진술' {param($d) "<b>$(& $e $d.statement)</b>"}
        & $a '</table>'
    }
    & $a '<h1 class=pb>3. 간호계획</h1><table><tr><th style="width:15%"></th>'
    $n=0;foreach($d in $m.diags){$n++;& $a "<th>${n}순위</th>"};& $a '</tr><tr><td class=k>간호진단</td>'
    foreach($d in $m.diags){& $a "<td>$(& $e $d.statement)</td>"};& $a "</tr><tr><td class=k>우선순위의 근거</td><td colspan=$([Math]::Max(1,$m.diags.Count))>$(& $e $m.priority)</td></tr></table>"
    $n=0;foreach($d in $m.diags){$n++
        & $a "<table><tr><td class=k>간호진단 $n</td><td colspan=2><b>$(& $e $d.statement)</b></td></tr>"
        $sg='';$i=0;foreach($g in $d.short){$i++;$sg+="$i) $(& $e $g)<br>"}
        & $a "<tr><td class=k>간호목표<br>(기대되는 결과)</td><td colspan=2>▪ 장기목표 : $(& $e $d.long)<br>▪ 단기목표 :<br>$sg</td></tr>"
        & $a "<tr><th></th><th style=`"width:45%`">간호중재</th><th>이론적 근거</th></tr>"
        $i=0;foreach($p in $d.plans){$i++;& $a "<tr><td class=k style=`"font-weight:normal`">$(& $e $p.kind)</td><td>$i. $(& $e $p.plan)</td><td>$i. $(& $e $p.why)</td></tr>"}
        & $a '</table>'
    }
    & $a '<h1 class=pb>4. 간호수행 및 평가</h1>'
    $n=0;foreach($d in $m.diags){$n++
        $sg='';$i=0;foreach($g in $d.short){$i++;$sg+="$i) $(& $e $g)<br>"}
        $done='';$i=0;foreach($p in $d.plans){$i++;$done+="$i. <span class=blank>$md __:__</span> $(& $e $p.done) <span class=blank>(대상자 반응: )</span><br>"}
        $ev='';$i=0;foreach($g in $d.short){$i++;$ev+="단기목표 $i : 대상자는 <span class=blank>__/__ (결과 수치)</span> 이므로 <span class=blank>달성 / 부분적 달성 / 달성 못함</span>.<br>"}
        $ev+="장기목표 : 대상자는 <span class=blank>__/__ (퇴원 시 상태)</span> 이므로 <span class=blank>달성 / 부분적 달성 / 달성 못함</span>."
        & $a "<table><tr><td class=k>간호진단 $n</td><td><b>$(& $e $d.statement)</b></td></tr>"
        & $a "<tr><td class=k>간호목표<br>(기대되는 결과)</td><td>▪ 장기목표 : $(& $e $d.long)<br>▪ 단기목표 :<br>$sg</td></tr>"
        & $a "<tr><td class=k>간호수행</td><td>$done</td></tr><tr><td class=k>간호평가를 위한<br>자료수집</td><td>$(& $e $d.evalData)</td></tr><tr><td class=k>간호평가 진술문</td><td>$ev</td></tr></table>"
    }
    & $a '<h1 class=pb>5. 간호기록지 (SOAPIE)</h1><table><tr><th style="width:8%">날짜</th><th style="width:7%">시간</th><th style="width:15%">간호진단명</th><th style="width:6%">양식</th><th>간호기록</th><th style="width:8%">서명</th></tr>'
    foreach($r in Get-SoapieRows $m){& $a "<tr><td>$(& $e $r.date)</td><td class=blank>$(& $e $r.time)</td><td>$(& $e $r.dx)</td><td style=`"text-align:center`"><b>$($r.tag)</b></td><td>$(& $e $r.text)</td><td></td></tr>"}
    & $a '</table><p class=small>※ 자동으로 만든 틀입니다. 진단 정의는 별책 부록 8을, 이론적 근거와 수치는 교재와 대상자 자료로 꼭 확인·수정하세요.</p></div></body></html>'
    return $h.ToString()
}

# ---------- 제출 양식 (학교 간호과정 보고서: 사정 / 간호계획 및 수행 / 합리적 근거 / 간호평가) ----------
$script:VitalSigns='(?i)(\bBP\b|혈압|\bP\s*\d|\bPR\b|맥박|\bR\s*\d|\bRR\b|호흡수|\bBT\b|체온|V/S|SpO2|산소포화도)'
$script:Circled='①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
function Get-Circled($n){if($n -ge 1 -and $n -le 20){return [string]$script:Circled[$n-1]};return "($n)"}
# 계획 문장(~한다.)을 수행 기록(~함)으로 바꾼다
function ConvertTo-Done($sentence) {
    $s=$sentence.Trim()
    foreach($pair in @(@('돕는다.','도움'),@('둔다.','둠'),@('올린다.','올림'),@('줄인다.','줄임'),@('만든다.','만듦'),@('지킨다.','지킴'),@('피한다.','피함'))){
        if($s.EndsWith($pair[0])){return $s.Substring(0,$s.Length-$pair[0].Length)+$pair[1]}
    }
    if($s.EndsWith('한다.')){return $s.Substring(0,$s.Length-3)+'함'}
    return $s.TrimEnd('.')
}
function Get-ReportSections($m) {
    $out=@()
    foreach($d in $m.diags){
        $s=@($m.subjective|Where-Object {$_ -in $d.cues});if($s.Count -eq 0){$s=@($m.subjective)}
        # 진단 단서 + 활력징후(모든 진단에 공통으로 쓰이는 자료), 원래 순서 유지
        $o=@($m.objective|Where-Object {($_ -in $d.cues) -or ($_ -match $script:VitalSigns)});if($o.Count -eq 0){$o=@($m.objective)}
        $groups=@();$n=0
        foreach($kind in @(@('진단적','진단적 지시'),@('치료적','치료적 지시'),@('교육적','교육적 지시'))){
            $items=@();foreach($p in @($d.plans|Where-Object {$_.kind -eq $kind[0]})){$n++;$items+=[pscustomobject]@{no=(Get-Circled $n);plan=$p.plan;why=$p.why;done=(ConvertTo-Done $p.plan)}}
            if($items.Count){$groups+=[pscustomobject]@{title=$kind[1];items=$items}}
        }
        $out+=[pscustomobject]@{d=$d;s=$s;o=$o;groups=$groups}
    }
    return $out
}
function ConvertTo-ReportText($m) {
    $sb=New-Object Text.StringBuilder;$w={param($x) [void]$sb.AppendLine($x)}
    $md=$m.date.ToString('M/d',[Globalization.CultureInfo]::InvariantCulture)
    $k=0
    foreach($sec in Get-ReportSections $m){$k++;$d=$sec.d
        if($k -gt 1){& $w ''}
        & $w "■ 간호진단 $k  $($d.statement)"
        & $w '';& $w '[사정(자료수집)]'
        & $w "주관적 자료 : $(if($sec.s.Count){$sec.s -join ', '}else{'"(대상자가 직접 한 말)"'})"
        & $w "객관적 자료 : $(if($sec.o.Count){$sec.o -join ', '}else{'(V/S, 검사 결과, 관찰 내용)'})"
        & $w '';& $w '[간호계획 및 수행]'
        & $w "장기목표: $($d.long)"
        $i=0;foreach($g in $d.short){$i++;& $w "$(if($i -eq 1){'단기목표: '}else{'          '})$g"}
        & $w '';& $w '– 계획 –'
        foreach($g in $sec.groups){& $w "[$($g.title)]";foreach($it in $g.items){& $w "$($it.no)$($it.plan)"}}
        & $w '';& $w '– 수행 –'
        $i=0;foreach($g in $sec.groups){foreach($it in $g.items){$i++;& $w "$i. $($it.done)";& $w "   - $md __:__ (수행 결과·대상자 반응을 적으세요)"}}
        & $w '';& $w '[합리적 근거]'
        foreach($g in $sec.groups){foreach($it in $g.items){& $w "$($it.no)$($it.why)";& $w '(참고문헌: 저자 외. (연도). 교재명 제_판 p.__ 출판사 — 확인 후 적으세요)'}}
        & $w '';& $w '[간호평가]'
        & $w "장기목표: $($d.long) (달성 / 부분 달성 / 미달성)"
        $i=0;foreach($g in $d.short){$i++;& $w "$(if($i -eq 1){'단기목표: '}else{'          '})$g (달성 / 부분 달성 / 미달성)"}
    }
    & $w '';& $w '※ 자동으로 만든 틀입니다. 수행 결과와 참고문헌은 직접 채우고, 이론적 근거는 교재로 꼭 확인·수정하세요.'
    return $sb.ToString()
}
# A4 세로 표 양식 (표지 + 진단별 표)
function ConvertTo-ReportHtml($m,$cover) {
    $e={param($x) [System.Net.WebUtility]::HtmlEncode([string]$x)}
    $md=$m.date.ToString('M/d',[Globalization.CultureInfo]::InvariantCulture)
    $h=New-Object Text.StringBuilder;$a={param($x) [void]$h.Append($x)}
    & $a @'
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>간호과정</title>
<style>
@page{size:210mm 297mm;margin:20mm 18mm}
@page Section1{size:210mm 297mm;margin:20mm 18mm}
div.Section1{page:Section1}
body{font-family:'맑은 고딕','Malgun Gothic','Noto Sans KR',sans-serif;font-size:10.5pt;color:#000;line-height:1.55}
table{border-collapse:collapse;width:100%}
td{border:1px solid #000;padding:4pt 6pt;vertical-align:top}
td.k{width:19%;text-align:center;vertical-align:middle}
h2{font-size:12pt;margin:0 0 6pt}
.cover{text-align:center;page-break-after:always}
.cover .subj{font-size:14pt;text-align:left;margin-top:60pt}
.cover .title{font-size:24pt;margin:70pt 0 210pt}
.cover .meta{font-size:13pt;line-height:2}
.cover .school{font-size:14pt;margin-top:110pt}
.blank{color:#c06000}.small{font-size:9pt;color:#555}
.pb{page-break-before:always}
</style></head><body><div class=Section1>
'@
    if($cover){
        & $a "<div class=cover><div class=subj>$(& $e $cover.subject)</div><div class=title>$(& $e $cover.title)</div>"
        & $a "<div class=meta>제출일 : $(& $e $cover.date)<br>제출자 : $(& $e $cover.author)</div><div class=school>$(& $e $cover.school)</div></div>"
    }
    $k=0
    foreach($sec in Get-ReportSections $m){$k++;$d=$sec.d
        & $a "<h2$(if($k -gt 1){' class=pb'})>간호진단</h2><table><tr><td colspan=2>간호진단 $k $(& $e $d.statement)</td></tr>"
        & $a "<tr><td class=k>사정(자료수집)</td><td>주관적 자료<br>: $(if($sec.s.Count){& $e ($sec.s -join ', ')}else{'<span class=blank>"(대상자가 직접 한 말)"</span>'})<br><br>객관적 자료<br>: $(if($sec.o.Count){& $e ($sec.o -join ', ')}else{'<span class=blank>(V/S, 검사 결과, 관찰 내용)</span>'})</td></tr>"
        $goal="장기목표: $(& $e $d.long)<br>";$i=0;foreach($g in $d.short){$i++;$goal+="$(if($i -eq 1){'단기목표: '})$(& $e $g)<br>"}
        $plan='';foreach($g in $sec.groups){$plan+="[$(& $e $g.title)]<br>";foreach($it in $g.items){$plan+="$($it.no)$(& $e $it.plan)<br>"};$plan+='<br>'}
        $done='';$i=0;foreach($g in $sec.groups){foreach($it in $g.items){$i++;$done+="$i. $(& $e $it.done)<br><span class=blank>&nbsp;&nbsp;- $md __:__ (수행 결과·대상자 반응)</span><br>"}}
        & $a "<tr><td class=k>간호계획 및<br>수행</td><td>$goal<br>– 계획 –<br>$plan– 수행 –<br>$done</td></tr>"
        $why='';foreach($g in $sec.groups){foreach($it in $g.items){$why+="$($it.no)$(& $e $it.why)<br><span class=blank>(참고문헌: 저자 외. (연도). 교재명 제_판 p.__ 출판사)</span><br>"}}
        & $a "<tr><td class=k>합리적 근거</td><td>$why</td></tr>"
        $ev="장기목표: $(& $e $d.long) <span class=blank>(달성 / 부분 달성 / 미달성)</span><br>";$i=0;foreach($g in $d.short){$i++;$ev+="$(if($i -eq 1){'단기목표: '})$(& $e $g) <span class=blank>(달성 / 부분 달성 / 미달성)</span><br>"}
        & $a "<tr><td class=k>간호평가</td><td>$ev</td></tr></table>"
    }
    & $a '<p class=small>※ 자동으로 만든 틀입니다. 수행 결과와 참고문헌은 직접 채우고, 이론적 근거는 교재로 꼭 확인·수정하세요.</p></div></body></html>'
    return $h.ToString()
}

function Test-Templates {
    $found=Find-Diagnoses '배가 쥐어짜는 듯이 너무 아파요' "Fever(+)`nNRS : 5/10점`nWBC(20000)`nChilling(+)" 'acute peritonitis'
    if($found[0] -ne '급성 통증'){throw "auto diagnosis failed: $($found -join ',')"}
    if('고체온' -notin $found){throw 'fever not detected'}
    $doc=New-NursingProcess '배가 쥐어짜는 듯이 너무 아파요' "Fever(+)`nNRS : 5/10점" 'acute peritonitis' @(@{name='급성 통증';cause='복강 내 염증';origin='날음식 섭취'}) (Get-Date '2021-04-20')
    foreach($must in @('■ 사정','■ 진단','■ 계획','■ 중재','■ 평가','날음식 섭취로 인한 복강 내 염증과 관련된 급성 통증','2점 이하','사정하였다.','4/20 __:__','- Dx. acute peritonitis')){if($doc -notlike "*$must*"){throw "missing: $must"}}
    if((Format-Diagnosis '감염 과정' '고체온' $null) -ne '감염 과정과 관련된 고체온'){throw 'particle 과 failed'}
    if((Format-Diagnosis '통증' '불안' $null) -ne '통증과 관련된 불안'){throw 'particle failed'}
    if((Format-Diagnosis '피로' '불안' $null) -ne '피로와 관련된 불안'){throw 'particle 와 failed'}
    if((Get-Ro '수술') -ne '로' -or (Get-Ro '감염') -ne '으로' -or (Get-Ro '설사') -ne '로'){throw 'ro failed'}
    $m=New-WorkbookModel '배가 쥐어짜는 듯이 너무 아파요' "Fever(+)`nNRS : 5/10점`nWBC(20000)" 'acute peritonitis' @(@{name='감염의 위험';cause='침습적 처치';origin=''},@{name='급성 통증';cause='복강 내 염증';origin=''}) (Get-Date '2021-04-20') $true
    if($m.diags[0].name -ne '급성 통증'){throw 'priority sort failed'}
    $wt=ConvertTo-WorkbookText $m
    foreach($must in @('■ 1. 간호사정','단서묶음 1','별책 부록 8, p.26','12. 안위 Comfort 영역에 해당하는 자료','우선순위의 근거','간호평가를 위한 자료수집','S : ')){if($wt -notlike "*$must*"){throw "workbook missing: $must"}}
    $html=ConvertTo-WorkbookHtml $m
    if($html -notlike '*size:364mm 257mm*' -or $html -notlike '*단서묶음 2*'){throw 'html failed'}
    $rt=ConvertTo-ReportText $m
    foreach($must in @('■ 간호진단 1  복강 내 염증과 관련된 급성 통증','[사정(자료수집)]','– 계획 –','[진단적 지시]','①매 4시간마다 V/S를 사정한다.','1. 매 4시간마다 V/S를 사정함','[합리적 근거]','[간호평가]','(달성 / 부분 달성 / 미달성)')){if($rt -notlike "*$must*"){throw "report missing: $must"}}
    if((ConvertTo-Done '침상 난간을 항상 올리고 침대 높이를 낮게 유지한다.') -ne '침상 난간을 항상 올리고 침대 높이를 낮게 유지함'){throw 'done failed'}
    $rh=ConvertTo-ReportHtml $m @{subject='과목';title='제목';date='2026년 4월 3일';author='조';school='학교'}
    if($rh -notlike '*size:210mm 297mm*' -or $rh -notlike '*class=cover*'){throw 'report html failed'}
    Write-Output 'Template tests passed'
}
