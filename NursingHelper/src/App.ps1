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
$script:settings=[pscustomobject]@{key='';model='gemini-2.5-flash';privacyOk=$false}
if(Test-Path -LiteralPath $script:settingsPath){
    try{$saved=Get-Content -LiteralPath $script:settingsPath -Raw -Encoding UTF8|ConvertFrom-Json;foreach($p in 'key','model','privacyOk'){if($null -ne $saved.$p){$script:settings.$p=$saved.$p}}}catch{}
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
function New-Label($text,$size=9.5,$bold=$false,$color=$null) {
    $l=New-Object Windows.Forms.Label;$l.Text=$text;$l.AutoSize=$true;$l.Font=[Theme]::UI($size,$bold)
    $l.ForeColor=if($color){$color}else{[Theme]::Text};$l.Margin=New-Object Windows.Forms.Padding(0,10,0,4);return $l
}
function New-Input($height,$hint) {
    $t=New-Object Windows.Forms.TextBox;$t.Multiline=($height -gt 30);$t.Width=356;$t.Height=$height
    $t.BorderStyle='FixedSingle';$t.Font=[Theme]::UI(10,$false);$t.BackColor=[Theme]::Surface;$t.ForeColor=[Theme]::Text
    if($t.Multiline){$t.ScrollBars='Vertical';$t.AcceptsReturn=$true}
    $tip.SetToolTip($t,$hint);return $t
}
function New-Button($text,$primary=$false,$width=0) {
    $b=New-Object Windows.Forms.Button;$b.Text=$text;$b.FlatStyle='Flat';$b.Height=36;$b.Font=[Theme]::UI(9.5,$primary)
    $b.AutoSize=($width -eq 0);if($width){$b.Width=$width};$b.Cursor=[Windows.Forms.Cursors]::Hand;$b.Margin=New-Object Windows.Forms.Padding(0,0,8,0)
    $b.FlatAppearance.BorderSize=if($primary){0}else{1};$b.FlatAppearance.BorderColor=[Theme]::Separator
    $b.BackColor=if($primary){[Theme]::Accent}else{[Theme]::Surface};$b.ForeColor=if($primary){[Drawing.Color]::White}else{[Theme]::Text}
    $b.Padding=New-Object Windows.Forms.Padding(10,0,10,0);return $b
}
function Set-Status($text) {$status.Text=$text;[Windows.Forms.Application]::DoEvents()}

# ---------- 진단 선택 ----------
$script:choices=[ordered]@{}   # 진단명 -> @{cause; origin}
function Refresh-Diagnoses($suggested) {
    $diagList.BeginUpdate();$diagList.Items.Clear()
    $order=@($suggested)+@($script:Templates.Keys|Where-Object {$_ -notin $suggested})
    foreach($name in $order){
        if(-not $script:choices.Contains($name)){$script:choices[$name]=@{cause=$script:Templates[$name].cause;origin=''}}
        $label=if($name -in $suggested){"$name   · 추천"}else{$name}
        [void]$diagList.Items.Add($label,($name -in $suggested))
    }
    $diagList.EndUpdate()
    if($diagList.Items.Count -gt 0){$diagList.SelectedIndex=0}
}
function Get-ItemName($label){return ($label -replace '\s+· 추천$','')}
function Get-Checked {
    $result=@()
    foreach($label in $diagList.CheckedItems){$name=Get-ItemName $label;$c=$script:choices[$name];$result+=@{name=$name;cause=$c.cause;origin=$c.origin}}
    return $result
}
function Suggest {
    $found=Find-Diagnoses $sData.Text $oData.Text $dxBox.Text
    Refresh-Diagnoses @($found|Select-Object -First 3)
    if($found.Count -eq 0){Set-Status '자료에서 추천할 진단을 찾지 못했어요. 목록에서 직접 체크하세요.'}
    else{Set-Status "추천 진단: $((@($found|Select-Object -First 3)) -join ', ')  ·  원인(관련 요인)을 대상자에 맞게 고치세요."}
}

# ---------- 결과 표시 ----------
function Show-Document($text) {
    $text=$text -replace "`r`n","`n"
    $output.Text=$text
    $output.SelectAll();$output.SelectionFont=[Theme]::UI(10.5,$false);$output.SelectionColor=[Theme]::Text
    $pos=0
    foreach($ln in ($text -split "`n")){
        $len=$ln.Length
        if($ln -match '^(■|진단 \d+ :|장기목표|단기목표|진단적 |치료적 |교육적 |주관적 자료|객관적 자료|단기목표 평가|장기목표 평가)'){
            $output.Select($pos,$len)
            $output.SelectionFont=if($ln.StartsWith('■')){[Theme]::UI(13,$true)}else{[Theme]::UI(10.5,$true)}
            if($ln.StartsWith('■') -or $ln -match '^진단 \d+ :'){$output.SelectionColor=[Theme]::Accent}
        } elseif($ln -match '^\s*이론적 근거') {
            $output.Select($pos,$len);$output.SelectionColor=[Theme]::Secondary
        } elseif($ln -match '__:__|__/__|\(.*적으세요\)') {
            $output.Select($pos,$len);$output.SelectionColor=[Drawing.Color]::FromArgb(255,149,0)
        }
        $pos+=$len+1
    }
    $output.Select(0,0);$output.ScrollToCaret()
}
function Build-Document {
    $chosen=@(Get-Checked)
    if($chosen.Count -eq 0){Suggest;$chosen=@(Get-Checked)}
    if($chosen.Count -eq 0){[Windows.Forms.MessageBox]::Show('간호진단을 하나 이상 체크하세요.','간호과정 도우미');return}
    Show-Document (New-NursingProcess $sData.Text $oData.Text $dxBox.Text $chosen $datePicker.Value)
    Set-Status "틀을 만들었어요 · 진단 $($chosen.Count)개  ·  주황색 칸을 채우거나 ‘제미나이로 다듬기’를 눌러 보세요."
}

# ---------- 제미나이 다듬기 ----------
$script:job=$null
function Open-Settings {
    $d=New-Object Windows.Forms.Form;$d.Text='제미나이 설정';$d.Size=New-Object Drawing.Size(470,300);$d.StartPosition='CenterParent'
    $d.FormBorderStyle='FixedDialog';$d.MaximizeBox=$false;$d.MinimizeBox=$false;$d.BackColor=[Theme]::Back;$d.Font=[Theme]::UI(9.5,$false)
    $panel=New-Object Windows.Forms.FlowLayoutPanel;$panel.Dock='Fill';$panel.FlowDirection='TopDown';$panel.Padding=New-Object Windows.Forms.Padding(20,12,20,12);$panel.WrapContents=$false
    $keyBox=New-Input 26 'Google AI Studio에서 받은 API 키';$keyBox.UseSystemPasswordChar=$true;$keyBox.Width=410;$keyBox.Text=Get-ApiKey
    $modelBox=New-Input 26 '사용할 제미나이 모델 이름';$modelBox.Width=410;$modelBox.Text=$script:settings.model
    $note=New-Label "키는 이 PC의 Windows 계정으로 암호화해서 저장돼요. GitHub나 다른 곳에 올라가지 않아요.`r`n키 발급: aistudio.google.com → Get API key" 8.5 $false ([Theme]::Secondary)
    $row=New-Object Windows.Forms.FlowLayoutPanel;$row.AutoSize=$true;$row.Margin=New-Object Windows.Forms.Padding(0,14,0,0)
    $ok=New-Button '저장' $true 90;$ok.DialogResult='OK';$link=New-Button '키 발급 페이지 열기'
    $link.Add_Click({Start-Process 'https://aistudio.google.com/apikey'})
    $row.Controls.AddRange(@($ok,$link))
    $panel.Controls.AddRange(@((New-Label 'API 키' 9.5 $true),$keyBox,(New-Label '모델' 9.5 $true),$modelBox,$note,$row))
    $d.Controls.Add($panel);$d.AcceptButton=$ok
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
    $polish.Enabled=$false;$polish.Text='  다듬는 중…  ';$progress.Visible=$true
    Set-Status '제미나이가 다듬는 중이에요 (보통 10~30초)…'
    $poll.Start()
}
function Finish-Polish {
    $job=$script:job;if(-not $job -or -not $job.handle.IsCompleted){return}
    $poll.Stop();$script:job=$null
    $polish.Enabled=$true;$polish.Text='✨ 제미나이로 다듬기';$progress.Visible=$false
    try{$result=$job.ps.EndInvoke($job.handle)|Select-Object -Last 1}catch{$result=@{ok=$false;code=0;text=$_.Exception.Message}}
    $job.ps.Dispose()
    if($result.ok -and $result.text){
        $text=$result.text -replace '(?m)^```[a-z]*\s*$','' -replace '\*\*','' -replace '(?m)^#+\s*',''
        Show-Document $text.Trim()
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
$form.Text='간호과정 도우미';$form.Size=New-Object Drawing.Size(1240,820);$form.MinimumSize=New-Object Drawing.Size(980,640);$form.StartPosition='CenterScreen'
$form.BackColor=[Theme]::Back;$form.Font=[Theme]::UI(10,$false);$form.KeyPreview=$true
try{if($env:MYSPACE_EXE -and (Test-Path -LiteralPath $env:MYSPACE_EXE)){$form.Icon=[Drawing.Icon]::ExtractAssociatedIcon($env:MYSPACE_EXE)}}catch{}

$left=New-Object Windows.Forms.FlowLayoutPanel;$left.Dock='Left';$left.Width=420;$left.FlowDirection='TopDown';$left.WrapContents=$false;$left.AutoScroll=$true
$left.Padding=New-Object Windows.Forms.Padding(24,18,12,12);$left.BackColor=[Theme]::Surface
$title=New-Label '간호과정 도우미' 17 $true;$title.Margin=New-Object Windows.Forms.Padding(0,0,0,0)
$sub=New-Label '자료를 넣으면 사정 → 진단 → 계획 → 중재 → 평가 틀을 만들어 줘요.' 9 $false ([Theme]::Secondary);$sub.Margin=New-Object Windows.Forms.Padding(0,2,0,6)
$sData=New-Input 70 '대상자가 직접 한 말 · 한 줄에 하나씩'
$oData=New-Input 130 'V/S, 검사 결과, 관찰 내용, 이미 투여된 약물 · 한 줄에 하나씩  예) Fever(+), NRS : 5/10점, WBC(20000)'
$dxBox=New-Input 26 '예) acute peritonitis'
$datePicker=New-Object Windows.Forms.DateTimePicker;$datePicker.Format='Short';$datePicker.Width=180;$datePicker.Font=[Theme]::UI(10,$false)
$suggestRow=New-Object Windows.Forms.FlowLayoutPanel;$suggestRow.AutoSize=$true;$suggestRow.Margin=New-Object Windows.Forms.Padding(0,14,0,0)
$suggestButton=New-Button '진단 추천';$sampleButton=New-Button '예시 불러오기';$clearButton=New-Button '지우기'
$suggestRow.Controls.AddRange(@($suggestButton,$sampleButton,$clearButton))
$diagList=New-Object Windows.Forms.CheckedListBox;$diagList.Width=356;$diagList.Height=150;$diagList.CheckOnClick=$true;$diagList.BorderStyle='FixedSingle'
$diagList.Font=[Theme]::UI(10,$false);$diagList.BackColor=[Theme]::Surface;$diagList.ForeColor=[Theme]::Text
$causeBox=New-Input 26 '예) 복강 내 염증  →  "복강 내 염증과 관련된 급성통증"'
$originBox=New-Input 26 '(선택) 예) 날음식 섭취  →  "날음식 섭취로 인한 복강 내 염증과 관련된 급성통증"'
$causeLabel=New-Label '원인 (관련 요인)' 9.5 $true
$build=New-Button '틀 만들기' $true 356;$build.Height=44;$build.Font=[Theme]::UI(11,$true);$build.Margin=New-Object Windows.Forms.Padding(0,16,0,0)
$left.Controls.AddRange(@($title,$sub,(New-Label '주관적 자료' 9.5 $true),$sData,(New-Label '객관적 자료' 9.5 $true),$oData,(New-Label '의학적 진단 (Dx)' 9.5 $true),$dxBox,(New-Label '작성 날짜' 9.5 $true),$datePicker,$suggestRow,(New-Label '간호진단 (우선순위 순서대로 체크)' 9.5 $true),$diagList,$causeLabel,$causeBox,(New-Label '원인의 원인 (방식 2 · 선택)' 9.5 $true),$originBox,$build))

$right=New-Object Windows.Forms.Panel;$right.Dock='Fill';$right.Padding=New-Object Windows.Forms.Padding(20,16,20,10);$right.BackColor=[Theme]::Back
$toolbar=New-Object Windows.Forms.FlowLayoutPanel;$toolbar.Dock='Top';$toolbar.Height=46;$toolbar.BackColor=[Theme]::Back
$polish=New-Button '✨ 제미나이로 다듬기' $true;$undo=New-Button '되돌리기';$undo.Visible=$false
$copy=New-Button '복사';$save=New-Button '저장';$settingsButton=New-Button '설정'
$progress=New-Object Windows.Forms.ProgressBar;$progress.Style='Marquee';$progress.Width=110;$progress.Height=8;$progress.Margin=New-Object Windows.Forms.Padding(4,14,8,0);$progress.Visible=$false
$toolbar.Controls.AddRange(@($polish,$progress,$undo,$copy,$save,$settingsButton))
$card=New-Object Windows.Forms.Panel;$card.Dock='Fill';$card.Padding=New-Object Windows.Forms.Padding(18,14,6,14);$card.BackColor=[Theme]::Surface
$output=New-Object Windows.Forms.RichTextBox;$output.Dock='Fill';$output.BorderStyle='None';$output.BackColor=[Theme]::Surface;$output.ForeColor=[Theme]::Text;$output.Font=[Theme]::UI(10.5,$false);$output.DetectUrls=$false
$output.Text="왼쪽에 자료를 넣고 ‘틀 만들기’를 누르세요.`n`n· ‘예시 불러오기’로 사용법을 바로 볼 수 있어요.`n· 결과는 여기서 바로 고칠 수 있어요.`n· 저장은 Word·한글에서 열리는 .rtf 또는 .txt로 할 수 있어요."
$card.Controls.Add($output)
$status=New-Object Windows.Forms.Label;$status.Dock='Bottom';$status.Height=28;$status.TextAlign='MiddleLeft';$status.ForeColor=[Theme]::Secondary;$status.Font=[Theme]::UI(9,$false)
$spacer=New-Object Windows.Forms.Panel;$spacer.Dock='Top';$spacer.Height=8;$spacer.BackColor=[Theme]::Back
$right.Controls.AddRange(@($card,$spacer,$toolbar,$status))
$form.Controls.AddRange(@($right,$left))

$poll=New-Object Windows.Forms.Timer;$poll.Interval=300;$poll.Add_Tick({Finish-Polish})

# ---------- 이벤트 ----------
$suggestButton.Add_Click({Suggest})
$build.Add_Click({Build-Document})
function Load-Sample {
    $sData.Text='배가 쥐어짜는 듯이 너무 아파요'
    $oData.Text="Fever(+)`r`nNRS : 5/10점`r`n배를 움켜잡은 채 웅크리고 있는 모습 관찰됨`r`nChilling(+)`r`n데노간(+)`r`nWBC(20000)`r`nCRP(4.0)"
    $dxBox.Text='acute peritonitis'
    Suggest
}
$sampleButton.Add_Click({Load-Sample})
$clearButton.Add_Click({$sData.Clear();$oData.Clear();$dxBox.Clear();$script:choices=[ordered]@{};Refresh-Diagnoses @();Set-Status ''})
$diagList.Add_SelectedIndexChanged({
    if($diagList.SelectedItem){$name=Get-ItemName $diagList.SelectedItem;$c=$script:choices[$name]
        $script:loading=$true;$causeBox.Text=$c.cause;$originBox.Text=$c.origin;$script:loading=$false
        $causeLabel.Text="원인 (관련 요인) · $name"}
})
$causeBox.Add_TextChanged({if(-not $script:loading -and $diagList.SelectedItem){$script:choices[(Get-ItemName $diagList.SelectedItem)].cause=$causeBox.Text.Trim()}})
$originBox.Add_TextChanged({if(-not $script:loading -and $diagList.SelectedItem){$script:choices[(Get-ItemName $diagList.SelectedItem)].origin=$originBox.Text.Trim()}})
$polish.Add_Click({Start-Polish})
$undo.Add_Click({if($script:before){Show-Document $script:before;$undo.Visible=$false;Set-Status '다듬기 전으로 되돌렸어요.'}})
$copy.Add_Click({if($output.Text){[Windows.Forms.Clipboard]::SetText($output.Text);Set-Status '복사했어요. Word·한글에 붙여넣으세요.'}})
$save.Add_Click({
    $dialog=New-Object Windows.Forms.SaveFileDialog;$dialog.Filter='Word·한글 문서 (*.rtf)|*.rtf|텍스트 (*.txt)|*.txt';$dialog.FileName="간호과정_$($datePicker.Value.ToString('yyyyMMdd'))"
    if($dialog.ShowDialog($form) -eq 'OK'){
        if($dialog.FileName.EndsWith('.txt')){[IO.File]::WriteAllText($dialog.FileName,$output.Text.Replace("`n","`r`n"),[Text.UTF8Encoding]::new($true))}else{$output.SaveFile($dialog.FileName,'RichText')}
        Set-Status "저장했어요: $($dialog.FileName)"
    }
    $dialog.Dispose()
})
$settingsButton.Add_Click({Open-Settings})
$form.Add_KeyDown({if($_.Control -and $_.KeyCode -eq 'Return'){Build-Document;$_.Handled=$true}})
$tip.SetToolTip($build,'Ctrl+Enter');$tip.SetToolTip($polish,'입력 자료에 맞게 목표·근거를 구체적으로 다듬어요 (API 키 필요)')

Refresh-Diagnoses @()
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
