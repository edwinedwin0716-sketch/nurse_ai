param([switch]$Check,[switch]$SelfTest)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security
Add-Type -Path (Join-Path $PSScriptRoot 'ModernControls.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing
. (Join-Path $PSScriptRoot 'Templates.ps1')
if(-not($Check -or $SelfTest)){
    $created=$false;$script:instance=New-Object Threading.Mutex($true,'Local\NursingHelperShare',([ref]$created))
    if(-not $created){[ShellImages]::ActivateExisting();$script:instance.Dispose();exit 0}
}
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:settingsPath=Join-Path $env:MYSPACE_DATA_DIR 'settings.json'
$script:settings=[pscustomobject]@{key='';model='gemini-2.5-flash';privacyOk=$false;cover=$null}
if(Test-Path -LiteralPath $script:settingsPath){
    try{$saved=Get-Content -LiteralPath $script:settingsPath -Raw -Encoding UTF8|ConvertFrom-Json;foreach($p in 'key','model','privacyOk','cover'){if($null -ne $saved.$p){$script:settings.$p=$saved.$p}}}catch{}
}
function Save-Settings {
    $json=$script:settings|ConvertTo-Json
    [IO.File]::WriteAllText($script:settingsPath,$json,[Text.UTF8Encoding]::new($false))
}
# API 키는 Windows 사용자 계정으로 암호화(DPAPI)해서 이 PC에만 저장한다
function Get-ApiKey {
    if(-not $script:settings.key){return ''}
    try{$bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($script:settings.key),$null,'CurrentUser');return [Text.Encoding]::UTF8.GetString($bytes)}catch{return ''}
}
function Set-ApiKey($plain) {
    if(-not $plain){$script:settings.key='';return}
    $script:settings.key=[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($plain),$null,'CurrentUser'))
}


# ---------- 공통 UI 도우미 ----------
function New-Text($text,$size=9.5,$bold=$false,$color=$null) {
    $l=New-Object Windows.Forms.Label;$l.Text=$text;$l.AutoSize=$true;$l.Font=[Theme]::UI($size,$bold);$l.BackColor=[Drawing.Color]::Transparent
    $l.ForeColor=if($color){$color}else{[Theme]::Text};return $l
}
function New-Section($text) {$l=New-Text $text 9 $true ([Theme]::Secondary);$l.Margin=New-Object Windows.Forms.Padding(6,16,0,6);return $l}
function New-Pill($text,$primary=$false) {$b=New-Object PillButton;$b.Text=$text;$b.Primary=$primary;$b.FitWidth();$b.Margin=New-Object Windows.Forms.Padding(0,0,8,0);return $b}
function New-Field($hint,$lines) {
    $t=New-Object Windows.Forms.TextBox;$t.BorderStyle='None';$t.Font=[Theme]::UI(10.5,$false);$t.BackColor=[Theme]::Surface;$t.ForeColor=[Theme]::Text
    if($lines -gt 1){$t.Multiline=$true;$t.ScrollBars='Vertical';$t.AcceptsReturn=$true;$t.Height=20*$lines}
    $tip.SetToolTip($t,$hint);return $t
}
# 카드 안에 '제목 + 입력칸'을 위에서 아래로 쌓는다
function New-FormCard($width,$rows) {
    $card=New-Object Card;$card.Width=$width;$card.Margin=New-Object Windows.Forms.Padding(0,0,0,0)
    $y=12;$first=$true
    foreach($r in $rows){
        if(-not $first){$line=New-Object Hairline;$line.SetBounds(16,$y,$width-32,1);$card.Controls.Add($line);$y+=10}
        $first=$false
        $label=New-Text $r[0] 8.5 $true ([Theme]::Secondary);$label.Location=New-Object Drawing.Point(16,$y);$card.Controls.Add($label);$y+=20
        $r[1].SetBounds(16,$y,$width-32,$r[1].Height);$card.Controls.Add($r[1]);$y+=$r[1].Height+10
    }
    $card.Height=$y+4;return $card
}
function Set-Status($text) {$status.Text=$text;[Windows.Forms.Application]::DoEvents()}

# ---------- 진단 선택 ----------
$script:choices=[ordered]@{}   # 진단명 -> @{cause; origin}
$script:rows=@()
$script:selected=$null
function Select-Row($row) {
    foreach($r in $script:rows){$r.Selected=($r -eq $row);$r.Invalidate()}
    $script:selected=$row
    if($row){$c=$script:choices[$row.Tag];$script:loading=$true;$causeBox.Text=$c.cause;$originBox.Text=$c.origin;$script:loading=$false;$causeTitle.Text="원인 (관련 요인) · $($row.Tag)"}
}
function Refresh-Diagnoses($suggested,$keepChecked=$false) {
    $checked=@($script:rows|Where-Object {$_.Checked}|ForEach-Object {$_.Tag})
    $diagList.SuspendLayout()
    foreach($r in $script:rows){$r.Dispose()};$diagList.Controls.Clear();$script:rows=@()
    $order=@($suggested)+@($script:Templates.Keys|Where-Object {$_ -notin $suggested})
    foreach($name in $order){
        if(-not $script:choices.Contains($name)){$script:choices[$name]=@{cause=$script:Templates[$name].cause;origin=''}}
        $row=New-Object CheckRow;$row.Text=$name;$row.Tag=$name;$row.Width=$diagCard.Width-$diagCard.Padding.Horizontal-22;$row.Margin=New-Object Windows.Forms.Padding(0)
        $row.Checked=if($keepChecked){$name -in $checked}else{$name -in $suggested}
        if($name -in $suggested){$row.Badge='추천'}
        $tip.SetToolTip($row,"$($script:Templates[$name].en)  ·  $($script:Templates[$name].domain)  ·  별책 부록 8 p.$($script:Templates[$name].page)")
        $row.Add_Click({Select-Row $this})
        $diagList.Controls.Add($row);$script:rows+=$row
    }
    $diagList.ResumeLayout()
    if($script:rows.Count){Select-Row $script:rows[0]}
}
function Move-Selected($delta) {
    $row=$script:selected;if(-not $row){return}
    $i=[array]::IndexOf($script:rows,$row);$j=$i+$delta
    if($j -lt 0 -or $j -ge $script:rows.Count){return}
    $list=[Collections.ArrayList]@($script:rows);$list.RemoveAt($i);$list.Insert($j,$row);$script:rows=@($list)
    $diagList.Controls.SetChildIndex($row,$j);$diagList.ScrollControlIntoView($row)
}
function Sort-Rows {
    $list=@($script:rows|Sort-Object @{e={-not $_.Checked}},@{e={$script:Templates[$_.Tag].priority}})
    for($i=0;$i -lt $list.Count;$i++){$diagList.Controls.SetChildIndex($list[$i],$i)}
    $script:rows=$list
    Set-Status '체크한 진단을 ABC(기도·호흡·순환) → 생리적 → 안전 → 심리 → 교육 순서로 정렬했어요.'
}
function Get-Checked {
    $result=@()
    foreach($r in $script:rows){if($r.Checked){$c=$script:choices[$r.Tag];$result+=@{name=$r.Tag;cause=$c.cause;origin=$c.origin}}}
    return $result
}
function Suggest {
    $found=Find-Diagnoses $sData.Text $oData.Text $dxBox.Text
    if($ageBox.SelectedIndex -eq 0){$found=@($found|ForEach-Object {if($_ -eq '성인 낙상의 위험'){'아동 낙상의 위험'}else{$_}}|Select-Object -Unique)}
    else{$found=@($found|Where-Object {$_ -ne '아동 낙상의 위험'})}
    $top=@($found|Select-Object -First 3)
    Refresh-Diagnoses $top
    if($found.Count -eq 0){Set-Status '자료에서 추천할 진단을 찾지 못했어요. 목록에서 직접 체크하세요.'}
    else{Set-Status "추천 진단: $($top -join ', ')  ·  원인(관련 요인)을 대상자에 맞게 고치세요."}
}

# ---------- 결과 표시 ----------
function Show-Document($text) {
    $script:rendering=$true
    $text=$text -replace "`r`n","`n"
    $output.Text=$text
    $output.SelectAll();$output.SelectionFont=[Theme]::UI(10.5,$false);$output.SelectionColor=[Theme]::Text
    $pos=0
    foreach($ln in ($text -split "`n")){
        $len=$ln.Length
        if($ln.StartsWith('■')){$output.Select($pos,$len);$output.SelectionFont=[Theme]::UI(14,$true);$output.SelectionColor=[Theme]::Accent}
        elseif($ln -match '^(\[.+\]$|– (계획|수행) –$)'){$output.Select($pos,$len);$output.SelectionFont=[Theme]::UI(10.5,$true)}
        elseif($ln -match '^(진단 \d+ :|간호진단 \d+ :|\d순위:|단서묶음 \d|장기목표$|단기목표$|진단적 |치료적 |교육적 |주관적 자료|객관적 자료|자료조직|간호문제|간호수행$|간호중재|단기목표 평가|장기목표 평가|우선순위의 근거|관련\(위험\)|간호진단 진술|간호평가)'){
            $output.Select($pos,$len);$output.SelectionFont=[Theme]::UI(10.5,$true)
            if($ln -match '^(진단 \d+ :|간호진단 \d+ :)'){$output.SelectionColor=[Theme]::Accent}
        } elseif($ln -match '이론적 근거') {$output.Select($pos,$len);$output.SelectionColor=[Theme]::Secondary}
        if($ln -match '__:__|__/__|적으세요\)|대상자 반응: \)'){$output.Select($pos,$len);$output.SelectionColor=[Drawing.Color]::FromArgb(230,126,0)}
        $pos+=$len+1
    }
    $output.Select(0,0);$output.ScrollToCaret()
    $script:rendering=$false
}
function Build-Document {
    $chosen=@(Get-Checked)
    if($chosen.Count -eq 0){Suggest;$chosen=@(Get-Checked)}
    if($chosen.Count -eq 0){[Windows.Forms.MessageBox]::Show('간호진단을 하나 이상 체크하세요.','간호과정 도우미')|Out-Null;return}
    if($formatTabs.Selected -eq '제출 양식'){
        $script:model=New-WorkbookModel $sData.Text $oData.Text $dxBox.Text $chosen $datePicker.Value
        $script:format='report'
        Show-Document (ConvertTo-ReportText $script:model)
    } elseif($formatTabs.Selected -eq 'B4 워크북'){
        $script:format='workbook'
        $script:model=New-WorkbookModel $sData.Text $oData.Text $dxBox.Text $chosen $datePicker.Value
        Show-Document (ConvertTo-WorkbookText $script:model)
    } else {
        $script:model=$null
        Show-Document (New-NursingProcess $sData.Text $oData.Text $dxBox.Text $chosen $datePicker.Value)
    }
    $undo.Visible=$false
    Set-Status "틀을 만들었어요 · 진단 $($chosen.Count)개 · 주황색 부분을 채우거나 ‘제미나이로 다듬기’를 눌러 보세요."
}
function ConvertTo-SimpleHtml($text) {
    $body=New-Object Text.StringBuilder
    foreach($ln in ($text -replace "`r`n","`n") -split "`n"){
        $x=[System.Net.WebUtility]::HtmlEncode($ln)
        if($ln.StartsWith('■')){[void]$body.Append("<h1>$x</h1>")}elseif($ln.Trim() -eq ''){[void]$body.Append('<br>')}else{[void]$body.Append("<p>$x</p>")}
    }
    return "<html><head><meta charset=`"utf-8`"><style>@page Section1{size:364mm 257mm;mso-page-orientation:landscape;margin:14mm 16mm}div.Section1{page:Section1}body{font-family:'맑은 고딕',sans-serif;font-size:10.5pt}h1{font-size:14pt;color:#0a7f8c;margin:12pt 0 4pt}p{margin:0 0 2pt}</style></head><body><div class=Section1>$body</div></body></html>"
}
# 제출 양식 표지 (이 PC에만 저장)
function Get-Cover {
    $c=$script:settings.cover
    $d=New-Object Windows.Forms.Form;$d.Text='표지';$d.ClientSize=New-Object Drawing.Size(460,400);$d.StartPosition='CenterParent'
    $d.FormBorderStyle='FixedDialog';$d.MaximizeBox=$false;$d.MinimizeBox=$false;$d.BackColor=[Theme]::Back;$d.Font=[Theme]::UI(9.5,$false)
    $title=New-Text '표지 정보' 14 $true;$title.Location=New-Object Drawing.Point(20,14)
    $f1=New-Field '예) 2026-1 여성건강간호학Ⅰ' 1;$f2=New-Field '예) 산후출혈 간호과정' 1;$f3=New-Field '예) C-7조 (학번 이름, …)' 1;$f4=New-Field '예) ○○대학교 간호학과' 1
    if($c){$f1.Text=$c.subject;$f2.Text=$c.title;$f3.Text=$c.author;$f4.Text=$c.school}
    $card=New-FormCard 420 @(@('과목',$f1),@('제목',$f2),@('제출자',$f3),@('학교·학과',$f4));$card.Location=New-Object Drawing.Point(20,50)
    $note=New-Text '이 정보는 이 PC에만 저장돼요.' 8.5 $false ([Theme]::Secondary);$note.Location=New-Object Drawing.Point(24,($card.Bottom+8))
    $ok=New-Pill '표지 넣고 저장' $true;$ok.Location=New-Object Drawing.Point(20,($note.Bottom+14))
    $skip=New-Pill '표지 없이 저장';$skip.Location=New-Object Drawing.Point(($ok.Right+8),$ok.Top)
    $ok.Add_Click({$d.DialogResult='OK';$d.Close()});$skip.Add_Click({$d.DialogResult='Ignore';$d.Close()})
    $d.Controls.AddRange(@($title,$card,$note,$ok,$skip))
    $r=$d.ShowDialog($form);$cover=$null
    if($r -eq 'OK'){
        $script:settings.cover=[pscustomobject]@{subject=$f1.Text.Trim();title=$f2.Text.Trim();author=$f3.Text.Trim();school=$f4.Text.Trim()};Save-Settings
        $cover=@{subject=$f1.Text.Trim();title=$f2.Text.Trim();author=$f3.Text.Trim();school=$f4.Text.Trim();date=$datePicker.Value.ToString('yyyy년 M월 d일',[Globalization.CultureInfo]::InvariantCulture)}
    }
    $d.Dispose()
    if($r -eq 'Cancel'){return 'cancel'}
    return $cover
}
function Save-Document {
    if(-not $output.Text.Trim()){return}
    $dialog=New-Object Windows.Forms.SaveFileDialog
    $dialog.Filter='Word 문서 (*.doc)|*.doc|웹 페이지 · 한글/브라우저에서 열기·인쇄 (*.html)|*.html|서식 있는 문서 (*.rtf)|*.rtf|텍스트 (*.txt)|*.txt'
    $dialog.FileName="간호과정_$($datePicker.Value.ToString('yyyyMMdd'))"
    if($dialog.ShowDialog($form) -eq 'OK'){
        $path=$dialog.FileName;$ext=[IO.Path]::GetExtension($path).ToLower()
        if($ext -in @('.doc','.html','.htm')){
            if($script:model -and $script:format -eq 'report'){$cover=Get-Cover;if($cover -eq 'cancel'){$dialog.Dispose();return};$html=ConvertTo-ReportHtml $script:model $cover}
            elseif($script:model){$html=ConvertTo-WorkbookHtml $script:model}else{$html=ConvertTo-SimpleHtml $output.Text};[IO.File]::WriteAllText($path,$html,[Text.UTF8Encoding]::new($true))}
        elseif($ext -eq '.txt'){[IO.File]::WriteAllText($path,$output.Text.Replace("`n","`r`n"),[Text.UTF8Encoding]::new($true))}
        else{$output.SaveFile($path,'RichText')}
        Set-Status "저장했어요: $path"
        if([Windows.Forms.MessageBox]::Show("저장했어요. 지금 열어 볼까요?`r`n$path",'간호과정 도우미','YesNo') -eq 'Yes'){Start-Process $path}
    }
    $dialog.Dispose()
}

# ---------- 제미나이 다듬기 ----------
$script:job=$null
function Open-Settings {
    $d=New-Object Windows.Forms.Form;$d.Text='제미나이 설정';$d.ClientSize=New-Object Drawing.Size(460,300);$d.StartPosition='CenterParent'
    $d.FormBorderStyle='FixedDialog';$d.MaximizeBox=$false;$d.MinimizeBox=$false;$d.BackColor=[Theme]::Back;$d.Font=[Theme]::UI(9.5,$false)
    $title=New-Text '제미나이 설정' 14 $true;$title.Location=New-Object Drawing.Point(20,16)
    $keyBox=New-Field 'Google AI Studio에서 받은 API 키' 1;$keyBox.UseSystemPasswordChar=$true;$keyBox.Text=Get-ApiKey
    $modelBox=New-Field '사용할 제미나이 모델 이름' 1;$modelBox.Text=$script:settings.model
    $card=New-FormCard 420 @(@('API 키',$keyBox),@('모델',$modelBox));$card.Location=New-Object Drawing.Point(20,54)
    $note=New-Text "키는 이 PC의 Windows 계정으로 암호화해서 저장돼요. GitHub나 다른 곳에 올라가지 않아요." 8.5 $false ([Theme]::Secondary);$note.Location=New-Object Drawing.Point(24,($card.Bottom+10))
    $ok=New-Pill '저장' $true;$ok.Location=New-Object Drawing.Point(20,($note.Bottom+18))
    $link=New-Pill '키 발급 페이지 열기';$link.Location=New-Object Drawing.Point(($ok.Right+8),$ok.Top)
    $ok.Add_Click({$d.DialogResult='OK';$d.Close()});$link.Add_Click({Start-Process 'https://aistudio.google.com/apikey'})
    $d.Controls.AddRange(@($title,$card,$note,$ok,$link))
    if($d.ShowDialog($form) -eq 'OK'){
        Set-ApiKey $keyBox.Text.Trim()
        $script:settings.model=if($modelBox.Text.Trim()){$modelBox.Text.Trim()}else{'gemini-2.5-flash'}
        Save-Settings;Set-Status '설정을 저장했어요.'
    }
    $d.Dispose()
}
function Get-Prompt($draft) {
@"
너는 한국 간호학과 교수다. 아래 [간호과정 초안]을 [대상자 자료]에 맞게 다듬어라.

[대상자 자료]
주관적 자료: $($sData.Text)
객관적 자료: $($oData.Text)
의학적 진단: $($dxBox.Text)

[반드시 지킬 규칙]
1. 초안의 구조와 제목(■ 사정, ■ 진단, ■ 계획, ■ 중재, ■ 평가, 장기목표, 단기목표, 진단적/치료적/교육적 계획·중재, 단기목표 평가)과 순서를 그대로 유지한다.
2. 주관적 자료는 대상자가 직접 한 말만 큰따옴표로 적고, 객관적 자료는 관찰·검사·이미 투여된 약물만 적는다. (+)는 증상 있음/양성, (-)는 없음/음성이다.
3. 간호진단은 '(원인)과 관련된 (진단명)' 또는 '(원인)으로 인한 (원인/증상)과 관련된 (진단명)' 형식을 지킨다. 원인은 자료와 직접 관련된 것으로 정한다.
4. 단기목표는 '대상자는 ~할 것이다' 형식으로, 달성기간과 객관적인 수치를 반드시 포함한다. 장기목표는 보통 퇴원 시까지로 한다.
5. 계획은 '~한다.', 중재는 '~하였다.'로 쓰고, 계획마다 '이론적 근거 :'를 전공 교재 수준의 사실로 1~2문장 쓴다. 대상자 자료(진단명, 검사 수치, 약물)에 맞게 구체화한다.
6. 자료에 없는 수치·시간·대상자 반응은 절대 지어내지 않는다. 중재의 '__:__', 평가의 '__/__'와 '(… 적으세요)' 같은 빈칸은 그대로 남긴다.
7. 확실하지 않은 의학 정보는 쓰지 않는다. 마크다운(**, #, 표)은 쓰지 말고 일반 텍스트로만 출력한다. 설명이나 인사말 없이 다듬은 문서만 출력한다.

[간호과정 초안]
$draft
"@
}
function Start-Polish {
    if($script:job){return}
    $key=Get-ApiKey
    if(-not $key){Open-Settings;$key=Get-ApiKey;if(-not $key){return}}
    if(-not $output.Text.Trim()){Build-Document;if(-not $output.Text.Trim()){return}}
    if(-not $script:settings.privacyOk){
        $answer=[Windows.Forms.MessageBox]::Show("입력한 자료와 초안이 Google 제미나이로 전송돼요.`r`n환자 이름, 등록번호, 생년월일 같은 개인정보는 넣지 마세요.`r`n`r`n계속할까요?",'개인정보 확인','YesNo','Warning')
        if($answer -ne 'Yes'){return}
        $script:settings.privacyOk=$true;Save-Settings
    }
    $script:before=$output.Text
    $body=@{contents=@(@{role='user';parts=@(@{text=(Get-Prompt $output.Text)})});generationConfig=@{temperature=0.3}}|ConvertTo-Json -Depth 8
    $ps=[PowerShell]::Create()
    [void]$ps.AddScript({
        param($key,$model,$body)
        [Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor 3072
        $wc=New-Object Net.WebClient;$wc.Encoding=[Text.Encoding]::UTF8
        $wc.Headers['Content-Type']='application/json; charset=utf-8';$wc.Headers['x-goog-api-key']=$key
        try{
            $raw=$wc.UploadString("https://generativelanguage.googleapis.com/v1beta/models/$([Uri]::EscapeDataString($model)):generateContent",'POST',$body)
            $res=$raw|ConvertFrom-Json
            $parts=@($res.candidates[0].content.parts|ForEach-Object {$_.text})
            return @{ok=$true;text=($parts -join '')}
        }catch{
            $ex=$_.Exception;while($ex.InnerException -and -not ($ex -is [Net.WebException])){$ex=$ex.InnerException}
            $code=0;$detail=''
            if($ex -is [Net.WebException] -and $ex.Response){$code=[int]$ex.Response.StatusCode;try{$detail=(New-Object IO.StreamReader($ex.Response.GetResponseStream())).ReadToEnd()}catch{}}
            return @{ok=$false;code=$code;text=$ex.Message;detail=$detail}
        }
    }).AddArgument($key).AddArgument($script:settings.model).AddArgument($body)
    $script:job=@{ps=$ps;handle=$ps.BeginInvoke();started=Get-Date}
    $polish.Enabled=$false;$polish.Text='다듬는 중…';$polish.Invalidate();$progress.Visible=$true
    Set-Status '제미나이가 다듬는 중이에요 (보통 10~30초)…'
    $poll.Start()
}
function Finish-Polish {
    $job=$script:job;if(-not $job -or -not $job.handle.IsCompleted){return}
    $poll.Stop();$script:job=$null
    $polish.Enabled=$true;$polish.Text='✨ 제미나이로 다듬기';$polish.Invalidate();$progress.Visible=$false
    try{$result=$job.ps.EndInvoke($job.handle)|Select-Object -Last 1}catch{$result=@{ok=$false;code=0;text=$_.Exception.Message}}
    $job.ps.Dispose()
    if($result.ok -and $result.text){
        $text=$result.text -replace '(?m)^```[a-z]*\s*$','' -replace '\*\*','' -replace '(?m)^#+\s*',''
        $script:model=$null;Show-Document $text.Trim()
        $undo.Visible=$true
        Set-Status "제미나이로 다듬었어요 ($([int]((Get-Date)-$job.started).TotalSeconds)초) · 내용을 교재로 꼭 확인하세요. 마음에 안 들면 ‘되돌리기’."
        return
    }
    $message=switch($result.code){
        400{'API 키나 요청이 올바르지 않아요. 설정에서 키를 다시 확인하세요.'}
        403{'이 API 키로는 제미나이를 쓸 수 없어요. 키가 삭제되었거나 권한이 없어요.'}
        404{"모델 '$($script:settings.model)'을 찾을 수 없어요. 설정에서 모델 이름을 바꿔 보세요 (예: gemini-2.5-flash)."}
        429{'무료 사용량을 다 썼어요. 1분 뒤에 다시 시도하거나 새 키를 발급받으세요.'}
        default{"제미나이 연결에 실패했어요: $($result.text)"}
    }
    Set-Status $message
    [Windows.Forms.MessageBox]::Show($message,'제미나이 다듬기','OK','Warning')|Out-Null
}


# ---------- 창 ----------
$tip=New-Object Windows.Forms.ToolTip
$form=New-Object Windows.Forms.Form
$form.Text='간호과정 도우미';$form.Size=New-Object Drawing.Size(1300,860);$form.MinimumSize=New-Object Drawing.Size(1040,660);$form.StartPosition='CenterScreen'
$form.BackColor=[Theme]::Back;$form.Font=[Theme]::UI(10,$false);$form.KeyPreview=$true
try{if($env:MYSPACE_EXE -and (Test-Path -LiteralPath $env:MYSPACE_EXE)){$form.Icon=[Drawing.Icon]::ExtractAssociatedIcon($env:MYSPACE_EXE)}}catch{}
$form.Add_HandleCreated({[Ui]::RoundCorners($form.Handle)|Out-Null})

$cardWidth=392
$left=New-Object Windows.Forms.FlowLayoutPanel;$left.Dock='Left';$left.Width=440;$left.FlowDirection='TopDown';$left.WrapContents=$false;$left.AutoScroll=$true
$left.Padding=New-Object Windows.Forms.Padding(24,20,8,20);$left.BackColor=[Theme]::Back
$left.Add_HandleCreated({[Ui]::ModernScroll($this,$false)})
$title=New-Text '간호과정 도우미' 20 $true;$title.Margin=New-Object Windows.Forms.Padding(4,0,0,0)
$sub=New-Text '자료를 넣으면 간호과정의 큰 틀을 만들어 줘요.' 9.5 $false ([Theme]::Secondary);$sub.Margin=New-Object Windows.Forms.Padding(6,2,0,0)

$sData=New-Field '대상자가 직접 한 말 · 한 줄에 하나씩' 3
$oData=New-Field 'V/S, 검사 결과, 관찰 내용, 이미 투여된 약물 · 한 줄에 하나씩  예) Fever(+), NRS : 5/10점, WBC(20000)' 6
$dxBox=New-Field '예) acute peritonitis' 1
$ageBox=New-Object Windows.Forms.ComboBox;$ageBox.DropDownStyle='DropDownList';$ageBox.FlatStyle='Flat';$ageBox.Font=[Theme]::UI(10,$false);$ageBox.Height=26
[void]$ageBox.Items.AddRange(@('아동 (보호자 포함)','성인'));$ageBox.SelectedIndex=0
$datePicker=New-Object Windows.Forms.DateTimePicker;$datePicker.Format='Long';$datePicker.Font=[Theme]::UI(10,$false);$datePicker.Height=26
$dataCard=New-FormCard $cardWidth @(@('주관적 자료',$sData),@('객관적 자료',$oData),@('의학적 진단 (Dx)',$dxBox),@('대상자',$ageBox),@('작성 날짜',$datePicker))

$actionRow=New-Object Windows.Forms.FlowLayoutPanel;$actionRow.AutoSize=$true;$actionRow.BackColor=[Theme]::Back;$actionRow.Margin=New-Object Windows.Forms.Padding(0,12,0,0)
$suggestButton=New-Pill '진단 추천';$sampleButton=New-Pill '예시 불러오기';$clearButton=New-Pill '지우기'
$actionRow.Controls.AddRange(@($suggestButton,$sampleButton,$clearButton))

$diagHeader=New-Object Windows.Forms.Panel;$diagHeader.Width=$cardWidth;$diagHeader.Height=40;$diagHeader.BackColor=[Theme]::Back;$diagHeader.Margin=New-Object Windows.Forms.Padding(0,8,0,4)
$diagTitle=New-Text '간호진단 · 위에서부터 우선순위' 9 $true ([Theme]::Secondary);$diagTitle.Location=New-Object Drawing.Point(6,14)
$upButton=New-Object RoundButton;$upButton.Glyph=[string][char]0xE70E;$downButton=New-Object RoundButton;$downButton.Glyph=[string][char]0xE70D
$sortButton=New-Pill '자동 정렬'
$sortButton.Location=New-Object Drawing.Point(($cardWidth-$sortButton.Width),3);$downButton.Location=New-Object Drawing.Point(($sortButton.Left-38),4);$upButton.Location=New-Object Drawing.Point(($downButton.Left-34),4)
$tip.SetToolTip($upButton,'선택한 진단을 위로');$tip.SetToolTip($downButton,'선택한 진단을 아래로');$tip.SetToolTip($sortButton,'체크한 진단을 ABC·매슬로우 순서로 정렬')
$diagHeader.Controls.AddRange(@($diagTitle,$upButton,$downButton,$sortButton))
$diagCard=New-Object Card;$diagCard.Width=$cardWidth;$diagCard.Height=262;$diagCard.Padding=New-Object Windows.Forms.Padding(6,8,4,8)
$diagList=New-Object Windows.Forms.FlowLayoutPanel;$diagList.Dock='Fill';$diagList.FlowDirection='TopDown';$diagList.WrapContents=$false;$diagList.AutoScroll=$true;$diagList.BackColor=[Theme]::Surface
$diagList.Add_HandleCreated({[Ui]::ModernScroll($this,$false)})
$diagCard.Controls.Add($diagList)

$causeBox=New-Field '예) 복강 내 염증  →  "복강 내 염증과 관련된 급성 통증"' 1
$originBox=New-Field '(선택) 예) 날음식 섭취  →  "날음식 섭취로 인한 복강 내 염증과 관련된 급성 통증"' 1
$causeCard=New-FormCard $cardWidth @(@('원인 (관련 요인)',$causeBox),@('원인의 원인 · 방식 2 (선택)',$originBox));$causeCard.Margin=New-Object Windows.Forms.Padding(0,14,0,0)
$causeTitle=$causeCard.Controls[0]

$build=New-Object PillButton;$build.Text='틀 만들기';$build.Primary=$true;$build.Width=$cardWidth;$build.Height=46;$build.Margin=New-Object Windows.Forms.Padding(0,18,0,0)
$tip.SetToolTip($build,'Ctrl+Enter')
$left.Controls.AddRange(@($title,$sub,(New-Section '대상자 자료'),$dataCard,$actionRow,$diagHeader,$diagCard,$causeCard,$build))

# 오른쪽: 형식 선택 + 결과
$right=New-Object Windows.Forms.Panel;$right.Dock='Fill';$right.Padding=New-Object Windows.Forms.Padding(12,20,24,8);$right.BackColor=[Theme]::Back
$toolbar=New-Object Windows.Forms.Panel;$toolbar.Dock='Top';$toolbar.Height=44;$toolbar.BackColor=[Theme]::Back
$formatTabs=New-Object Segmented;$formatTabs.Location=New-Object Drawing.Point(0,2);$formatTabs.SetItems([string[]]@('제출 양식','B4 워크북','기본 형식'),'제출 양식')
$tip.SetToolTip($formatTabs,'제출 양식: 학교 보고서 표 (사정 / 간호계획 및 수행 / 합리적 근거 / 간호평가, A4 · 표지)   B4 워크북: 간호과정 별책 워크북 순서 (간호사정 → 간호진단 → 간호계획 → 수행·평가 → 간호기록)')
$tools=New-Object Windows.Forms.FlowLayoutPanel;$tools.Dock='Right';$tools.AutoSize=$true;$tools.WrapContents=$false;$tools.BackColor=[Theme]::Back;$tools.Padding=New-Object Windows.Forms.Padding(0,2,0,0)
$progress=New-Object Windows.Forms.ProgressBar;$progress.Style='Marquee';$progress.Width=90;$progress.Height=6;$progress.Margin=New-Object Windows.Forms.Padding(0,16,10,0);$progress.Visible=$false
$polish=New-Pill '✨ 제미나이로 다듬기' $true;$undo=New-Pill '되돌리기';$undo.Visible=$false;$copy=New-Pill '복사';$save=New-Pill '저장'
$settingsButton=New-Object RoundButton;$settingsButton.Glyph=[string][char]0xE713;$settingsButton.Margin=New-Object Windows.Forms.Padding(0,1,0,0)
$tip.SetToolTip($polish,'입력 자료에 맞게 목표·근거를 구체적으로 다듬어요 (API 키 필요)');$tip.SetToolTip($settingsButton,'제미나이 설정')
$tools.Controls.AddRange(@($progress,$polish,$undo,$copy,$save,$settingsButton))
$toolbar.Controls.AddRange(@($formatTabs,$tools))
$gap=New-Object Windows.Forms.Panel;$gap.Dock='Top';$gap.Height=12;$gap.BackColor=[Theme]::Back
$paper=New-Object Card;$paper.Dock='Fill';$paper.Padding=New-Object Windows.Forms.Padding(26,20,10,16);$paper.Radius=16
$output=New-Object Windows.Forms.RichTextBox;$output.Dock='Fill';$output.BorderStyle='None';$output.BackColor=[Theme]::Surface;$output.ForeColor=[Theme]::Text;$output.Font=[Theme]::UI(10.5,$false);$output.DetectUrls=$false
$output.Add_HandleCreated({[Ui]::ModernScroll($this,$false)})
$paper.Controls.Add($output)
$status=New-Object Windows.Forms.Label;$status.Dock='Bottom';$status.Height=30;$status.TextAlign='MiddleLeft';$status.ForeColor=[Theme]::Secondary;$status.Font=[Theme]::UI(9,$false);$status.Padding=New-Object Windows.Forms.Padding(6,0,0,0)
$right.Controls.AddRange(@($paper,$gap,$toolbar,$status))
$form.Controls.AddRange(@($right,$left))

$poll=New-Object Windows.Forms.Timer;$poll.Interval=300;$poll.Add_Tick({Finish-Polish})

# ---------- 이벤트 ----------
function Load-Sample {
    $sData.Text='배가 쥐어짜는 듯이 너무 아파요'
    $oData.Text="Fever(+)`r`nNRS : 5/10점`r`n배를 움켜잡은 채 웅크리고 있는 모습 관찰됨`r`nChilling(+)`r`n데노간(+)`r`nWBC(20000)`r`nCRP(4.0)"
    $dxBox.Text='acute peritonitis';$ageBox.SelectedIndex=1
    Suggest
}
function Show-Welcome {
    Show-Document "■ 시작하기`n`n1. 왼쪽에 주관적·객관적 자료를 한 줄에 하나씩 넣으세요.`n2. ‘진단 추천’을 누르면 맞는 간호진단에 체크돼요. 위에서부터 우선순위예요.`n3. 진단을 눌러 원인(관련 요인)을 고치고 ‘틀 만들기’를 누르세요.`n`n· 위쪽에서 제출 양식 / B4 워크북 / 기본 형식을 고를 수 있어요.`n· 결과는 여기서 바로 고칠 수 있어요.`n· 저장 → Word(.doc)를 고르면 표 양식으로 저장돼요. 제출 양식은 표지도 넣을 수 있어요.`n· ‘예시 불러오기’로 바로 사용법을 볼 수 있어요."
}
$suggestButton.Add_Click({Suggest})
$sampleButton.Add_Click({Load-Sample})
$clearButton.Add_Click({$sData.Clear();$oData.Clear();$dxBox.Clear();$script:choices=[ordered]@{};Refresh-Diagnoses @();$script:model=$null;Show-Welcome;Set-Status ''})
$upButton.Add_Click({Move-Selected -1});$downButton.Add_Click({Move-Selected 1});$sortButton.Add_Click({Sort-Rows})
$causeBox.Add_TextChanged({if(-not $script:loading -and $script:selected){$script:choices[$script:selected.Tag].cause=$causeBox.Text.Trim()}})
$originBox.Add_TextChanged({if(-not $script:loading -and $script:selected){$script:choices[$script:selected.Tag].origin=$originBox.Text.Trim()}})
$build.Add_Click({Build-Document})
$formatTabs.Add_SelectedChanged({if(@(Get-Checked).Count -gt 0 -and ($sData.Text -or $oData.Text)){Build-Document}})
$polish.Add_Click({Start-Polish})
$undo.Add_Click({if($script:before){$script:model=$null;Show-Document $script:before;$undo.Visible=$false;Set-Status '다듬기 전으로 되돌렸어요.'}})
$copy.Add_Click({if($output.Text){[Windows.Forms.Clipboard]::SetText($output.Text);Set-Status '복사했어요. Word·한글에 붙여넣으세요.'}})
$save.Add_Click({Save-Document})
$settingsButton.Add_Click({Open-Settings})
$output.Add_TextChanged({if(-not $script:rendering){$script:model=$null}})
$form.Add_KeyDown({if($_.Control -and $_.KeyCode -eq 'Return'){Build-Document;$_.Handled=$true;$_.SuppressKeyPress=$true}})

Refresh-Diagnoses @()
Show-Welcome
if($Check -or $SelfTest){
    Test-Templates
    Load-Sample;Build-Document
    $form.Show();[Windows.Forms.Application]::DoEvents();$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
    $form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save((Join-Path $PSScriptRoot 'preview.png'));$bitmap.Dispose()
    $form.Dispose();Write-Output 'Nursing helper UI initialization and preview passed';exit 0
}
$form.Add_FormClosed({$poll.Stop();if($script:job){try{$script:job.ps.Stop();$script:job.ps.Dispose()}catch{}}})
[Windows.Forms.Application]::Run($form)
$tip.Dispose();$form.Dispose()
if($script:instance){$script:instance.ReleaseMutex();$script:instance.Dispose()}
