param([switch]$Check,[switch]$SelfTest)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'ModernControls.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing
. (Join-Path $PSScriptRoot 'Discovery.ps1')
if(-not($Check -or $SelfTest)){
    $created=$false;$script:instance=New-Object Threading.Mutex($true,'Local\MySpaceLauncherShare',([ref]$created))
    if(-not $created){[ShellImages]::ActivateExisting();$script:instance.Dispose();exit 0}
}
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:store = Join-Path $env:MYSPACE_DATA_DIR 'items.json'
$script:iconCache = Join-Path $env:MYSPACE_DATA_DIR 'icons'
$script:categories = @('즐겨찾기','AI','메신저','업무','게임','문서','도구')
$script:items = @()
$script:active = '즐겨찾기'
if (Test-Path -LiteralPath $script:store) {
    try {
        $data = Get-Content -LiteralPath $script:store -Raw -Encoding UTF8 | ConvertFrom-Json
        $script:items = @($data.items)
        $script:categories = @($data.categories)
        if($data.ignored){$script:ignored=@($data.ignored)}
        if($data.knownFiles){$script:knownFiles=@($data.knownFiles)}
        if($null -ne $data.autoEnabled){$script:autoEnabled=[bool]$data.autoEnabled}
        if($null -ne $data.opacity){$script:opacity=[Math]::Max(30,[Math]::Min(100,[int]$data.opacity))}
        if($data.theme -in @('light','dark')){$script:theme=[string]$data.theme}
        if($data.size -in @('small','medium','large')){$script:size=[string]$data.size}
    } catch { [System.Windows.Forms.MessageBox]::Show('저장 파일을 읽지 못했습니다. 원본을 확인하세요.'); exit 1 }
}
if(-not(Test-Path -LiteralPath $script:store) -and -not($Check -or $SelfTest)){
    foreach($website in @(@('ChatGPT','https://chatgpt.com/'),@('Gemini','https://gemini.google.com/'),@('Higgsfield','https://higgsfield.ai/'))){
        $script:items+=[pscustomobject]@{id=[guid]::NewGuid().ToString();name=$website[0];path=$website[1];category='AI';pinned=$true}
    }
    foreach($folder in @([Environment]::GetFolderPath('MyDocuments'),(Join-Path $env:USERPROFILE 'Downloads'),$script:protected)){
        if(Test-Path -LiteralPath $folder){$script:items+=[pscustomobject]@{id=[guid]::NewGuid().ToString();name=[IO.Path]::GetFileName($folder);path=$folder;category='즐겨찾기';pinned=$true}}
    }
    foreach($root in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'))){
        foreach($file in Get-ChildItem -LiteralPath $root -File -ErrorAction SilentlyContinue|Where-Object {$_.Extension -in @('.lnk','.url') -and $_.BaseName -notmatch 'MySpace|내 런처|uninstall|제거'}){
            $category=Get-Category $file.FullName
            $script:items+=[pscustomobject]@{id=[guid]::NewGuid().ToString();name=$file.BaseName;path=$file.FullName;category=$category;pinned=($category -in @('AI','메신저'))}
        }
    }
    foreach($app in Get-StartApps|Where-Object {$_.Name -match '^(ChatGPT|Codex|Claude|Copilot|Gemini|Discord(?: Canary| PTB)?|카카오톡|Telegram|WhatsApp|Signal|Slack|Microsoft Teams)$'}){
        if(@($script:items|Where-Object {$_.name -eq $app.Name}).Count -gt 0){continue}
        $category=if($app.Name -match 'ChatGPT|Codex|Claude|Copilot|Gemini'){'AI'}else{'메신저'}
        $script:items+=[pscustomobject]@{id=[guid]::NewGuid().ToString();name=$app.Name;path=('shell:AppsFolder\'+$app.AppID);category=$category;pinned=$true}
    }
}
function Save-Items {
    $json = @{categories=$script:categories; items=@($script:items);ignored=@($script:ignored);knownFiles=@($script:knownFiles);autoEnabled=$script:autoEnabled;opacity=$script:opacity;theme=$script:theme;size=$script:size} | ConvertTo-Json -Depth 5
    $temp = $script:store + '.tmp'
    [System.IO.File]::WriteAllText($temp,$json,[System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $script:store -Force
}
function New-Menu {
    $menu=New-Object Windows.Forms.ContextMenuStrip
    [AppleMenuRenderer]::Apply($menu)
    return $menu
}
function Ask-Text($title,$initial) {
    $dialog = New-Object System.Windows.Forms.Form
    $dialog.Text=$title; $dialog.Size=New-Object System.Drawing.Size(390,160)
    $dialog.StartPosition='CenterParent'; $dialog.FormBorderStyle='FixedDialog'
    $dialog.MaximizeBox=$false; $dialog.MinimizeBox=$false
    $dialog.BackColor=[Theme]::Back; $dialog.ForeColor=[Theme]::Text; $dialog.Font=[Theme]::UI(10,$false)
    $input=New-Object System.Windows.Forms.TextBox
    $input.SetBounds(18,20,335,28); $input.Text=$initial; $input.BorderStyle='FixedSingle'
    $input.BackColor=[Theme]::Surface; $input.ForeColor=[Theme]::Text
    $ok=New-Object System.Windows.Forms.Button
    $ok.Text='확인'; $ok.SetBounds(268,62,85,32); $ok.DialogResult='OK'
    $ok.FlatStyle='Flat'; $ok.FlatAppearance.BorderSize=0; $ok.BackColor=[Theme]::Accent; $ok.ForeColor=[Drawing.Color]::White
    $dialog.Controls.AddRange(@($input,$ok)); $dialog.AcceptButton=$ok
    $result=$null
    if($dialog.ShowDialog($form) -eq 'OK'){ $result=$input.Text.Trim() }
    $dialog.Dispose(); return $result
}
function Add-Path($path,$auto=$false) {
    if(($auto -and $path -eq $script:protected) -or $path.StartsWith($script:protected+'\',[StringComparison]::OrdinalIgnoreCase)){return}
    if(-not(Test-Path -LiteralPath $path)){return}
    if(@($script:items | Where-Object {$_.path -eq $path}).Count -gt 0){return}
    if($auto -and $path -in $script:ignored){return}
    $category=if($auto){Get-Category $path}elseif($script:active -eq '전체'){'즐겨찾기'}else{$script:active}
    if(-not $auto){$script:ignored=@($script:ignored|Where-Object {$_ -ne $path})}
    $script:items += [pscustomobject]@{id=[guid]::NewGuid().ToString();name=[IO.Path]::GetFileNameWithoutExtension($path);path=$path;category=$category}
    if(-not $auto){Save-Items}
}
# Icons are loaded once and shared, so searching and switching tabs stays fast
$script:iconMemo=@{}
function Get-Icon($path) {
    if(-not $script:iconMemo.ContainsKey($path)){$icon=$null;try{$icon=[ShellImages]::Load($path)}catch{};$script:iconMemo[$path]=$icon}
    return $script:iconMemo[$path]
}
function Start-Entry($entry) {
    try{if($entry.path.StartsWith('shell:AppsFolder\')){Start-Process -FilePath 'explorer.exe' -ArgumentList $entry.path -ErrorAction Stop}else{Start-Process -FilePath $entry.path -ErrorAction Stop}}
    catch{[Windows.Forms.MessageBox]::Show('실행할 수 없습니다. 파일 위치를 확인하세요.'+"`r`n"+$_.Exception.Message)}
}
function Render-Tiles {
    $tiles.SuspendLayout()
    foreach($control in @($tiles.Controls)){ $control.Dispose() }
    $tiles.Controls.Clear()
    $query=$search.Box.Text
    $visible=@($script:items | Where-Object {($script:active -eq '전체' -or $_.category -eq $script:active -or ($script:active -eq '즐겨찾기' -and $_.pinned)) -and ($_.name.IndexOf($query,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $_.path.IndexOf($query,[StringComparison]::OrdinalIgnoreCase) -ge 0)})
    foreach($entry in $visible){
        $tile=New-Object AppTile
        $tile.Text=$entry.name;$tile.Subtitle=$entry.category;$tile.Tag=$entry
        try {
            if($entry.iconPath -and (Test-Path -LiteralPath $entry.iconPath)){$tile.Icon=Get-Icon $entry.iconPath}
            elseif($entry.path -match '^https?:'){
                if($script:iconMemo[$entry.path]){$tile.Icon=$script:iconMemo[$entry.path]}
                else{$web=[WebIcons]::Cached($entry.path,$script:iconCache);if($web){$script:iconMemo[$entry.path]=$web;$tile.Icon=$web}else{$tile.LoadWebIcon($entry.path,$script:iconCache)}}
            }
            elseif($entry.path -notmatch '^steam:'){$tile.Icon=Get-Icon $entry.path}
        }catch{}
        $tip.SetToolTip($tile,"$($entry.name)`r`n$($entry.path)")
        $tile.Add_Click({if($_ -is [Windows.Forms.MouseEventArgs] -and $_.Button -ne 'Left'){return};Start-Entry $this.Tag})
        $menu=New-Menu
        $open=$menu.Items.Add('열기');$open.Tag=$entry;$open.Font=[Theme]::UI(9.5,$true);$open.Add_Click({Start-Entry $this.Tag})
        if($entry.path -notmatch '^(steam:|https?:|shell:)'){$reveal=$menu.Items.Add('파일 위치 열기');$reveal.Tag=$entry;$reveal.Add_Click({Start-Process -FilePath 'explorer.exe' -ArgumentList ('/select,"'+$this.Tag.path+'"')})}
        [void]$menu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
        $favorite=$menu.Items.Add($(if($entry.pinned){'즐겨찾기 해제'}else{'즐겨찾기에 고정'}));$favorite.Tag=$entry
        $favorite.Add_Click({$this.Tag|Add-Member -NotePropertyName pinned -NotePropertyValue (-not [bool]$this.Tag.pinned) -Force;Save-Items;Render-Tiles})
        $rename=$menu.Items.Add('이름 변경'); $rename.Tag=$entry
        $rename.Add_Click({$name=Ask-Text '표시 이름' $this.Tag.name;if($name){$this.Tag.name=$name;Save-Items;Render-Tiles}})
        $move=New-Object Windows.Forms.ToolStripMenuItem('카테고리 이동')
        foreach($cat in $script:categories){$option=$move.DropDownItems.Add($cat);$option.Tag=$entry;$option.Add_Click({$this.Tag.category=$this.Text;Save-Items;Render-Tiles})}
        [AppleMenuRenderer]::Apply($move.DropDown)
        [void]$menu.Items.Add($move)
        [void]$menu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
        $remove=$menu.Items.Add('목록에서 제거');$remove.Tag=$entry
        $remove.Add_Click({$script:ignored+=$this.Tag.path;$id=$this.Tag.id;$script:items=@($script:items|Where-Object {$_.id -ne $id});Save-Items;Render-Tiles})
        $tile.ContextMenuStrip=$menu
        $tile.Add_Disposed({if($this.ContextMenuStrip){$this.ContextMenuStrip.Dispose()}})
        $tiles.Controls.Add($tile)
    }
    if($visible.Count -eq 0){
        $empty=New-Object Windows.Forms.Label
        $empty.Text=if($query){"'$query'에 대한 결과가 없습니다."}else{"파일과 바로가기를 여기로 끌어놓으세요.`r`n오른쪽 위 + 버튼으로 파일이나 폴더도 추가할 수 있습니다."}
        $empty.ForeColor=[Theme]::Secondary;$empty.Size=New-Object Drawing.Size(700,90);$empty.Margin=New-Object Windows.Forms.Padding(24,30,0,0);$empty.Font=[Theme]::UI(11,$false)
        $tiles.Controls.Add($empty)
    }
    $script:visibleCount=$visible.Count
    Update-Status
    $tiles.ResumeLayout()
}
function Update-Status {
    $autoLabel=if($script:autoEnabled){'자동 추가 켜짐'}else{'자동 추가 꺼짐'}
    $hotkeyLabel=if($script:hotkey -and $script:hotkey.Registered){'   ·   Ctrl+Shift+Space로 열기/숨기기'}else{''}
    $status.Text="$($script:visibleCount)개 항목   ·   $autoLabel   ·   투명도 $($script:opacity)%$hotkeyLabel   ·   우클릭으로 정리"
}
function Render-Categories {
    $tabs.SetItems([string[]](@('전체')+$script:categories),$script:active)
}
function Set-Opacity($value) {
    $script:opacity=[Math]::Max(30,[Math]::Min(100,[int]$value))
    $form.Opacity=$script:opacity/100.0
    $percent.Text="$($script:opacity)%"
    if($script:roundedByOs -and $script:opacity -ge 100 -and $form.Region){$previous=$form.Region;$form.Region=$null;$previous.Dispose()}
    elseif($script:opacity -lt 100 -and -not $form.Region){Dock-Launcher}
    if($status.Text){Update-Status}
}
function Apply-Theme {
    [Theme]::Dark=($script:theme -eq 'dark')
    foreach($control in @($form,$header,$tabsHost,$tiles,$status)){$control.BackColor=[Theme]::Back}
    $title.ForeColor=[Theme]::Text;$status.ForeColor=[Theme]::Secondary;$percent.ForeColor=[Theme]::Secondary
    $search.Restyle()
    [Ui]::ModernScroll($tiles,[Theme]::Dark);[Ui]::ModernScroll($tabsHost,[Theme]::Dark)
    $themeButton.Glyph=if([Theme]::Dark){[string][char]0xE706}else{[string][char]0xE708}
    $tip.SetToolTip($themeButton,$(if([Theme]::Dark){'라이트 모드'}else{'다크 모드'}))
    $form.Invalidate($true)
}
function Show-Launcher {
    Dock-Launcher;$form.Show();$form.WindowState='Normal';$form.Activate();$search.Box.Focus();$search.Box.SelectAll()
}
function Toggle-Launcher {
    if($form.Visible -and [Windows.Forms.Form]::ActiveForm -eq $form){$form.Hide()}else{Show-Launcher}
}
function Set-WindowSize($size) {
    $script:size=$size;Dock-Launcher;Save-Items
}
function Layout-Header {
    $right=$header.Width-16
    foreach($control in @($moreButton,$addButton,$themeButton)){$right-=$control.Width;$control.Location=New-Object Drawing.Point($right,13);$right-=4}
    $right-=10;$right-=$percent.Width;$percent.Location=New-Object Drawing.Point($right,13)
    $right-=$slider.Width;$slider.Location=New-Object Drawing.Point($right,17)
    $right-=$opacityIcon.Width;$opacityIcon.Location=New-Object Drawing.Point($right,13)
    $search.Width=[Math]::Max(140,[Math]::Min(280,$right-16-$search.Left))
}

# ---------- Window ----------
$form=New-Object Windows.Forms.Form
$form.Text='내 런처';$form.FormBorderStyle='None';$form.StartPosition='Manual';$form.ShowInTaskbar=$true;$form.KeyPreview=$true
$form.Font=[Theme]::UI(10,$false)
$script:appIcon=$null;try{if($env:MYSPACE_EXE -and (Test-Path -LiteralPath $env:MYSPACE_EXE)){$script:appIcon=[Drawing.Icon]::ExtractAssociatedIcon($env:MYSPACE_EXE);$form.Icon=$script:appIcon}}catch{}
$tip=New-Object Windows.Forms.ToolTip

$header=New-Object Windows.Forms.Panel;$header.Dock='Top';$header.Height=58
$close=New-Object TrafficLight;$close.Dot=[Drawing.Color]::FromArgb(255,95,87);$close.Glyph='×';$close.Location=New-Object Drawing.Point(20,22);$close.Add_Click({$form.Close()})
$minimize=New-Object TrafficLight;$minimize.Dot=[Drawing.Color]::FromArgb(254,188,46);$minimize.Glyph='–';$minimize.Location=New-Object Drawing.Point(42,22);$minimize.Add_Click({$form.Hide()})
$pin=New-Object TrafficLight;$pin.Dot=[Drawing.Color]::FromArgb(40,200,64);$pin.Glyph='↑';$pin.Location=New-Object Drawing.Point(64,22)
$pin.Add_Click({$form.TopMost=-not $form.TopMost;$this.On=$form.TopMost;$this.Invalidate()})
$tip.SetToolTip($close,'종료');$tip.SetToolTip($minimize,'알림 영역으로 숨기기');$tip.SetToolTip($pin,'항상 위')
$title=New-Object Windows.Forms.Label;$title.Text='My Space';$title.Font=[Theme]::UI(12.5,$true);$title.AutoSize=$true;$title.Location=New-Object Drawing.Point(92,17)
$search=New-Object PillSearch;$search.Location=New-Object Drawing.Point(196,13)
$search.Box.Add_TextChanged({Render-Tiles})
$search.Box.Add_KeyDown({$key=$_;if($key.KeyCode -eq 'Enter'){$key.SuppressKeyPress=$true;$first=@($tiles.Controls|Where-Object {$_ -is [AppTile]})|Select-Object -First 1;if($first){Start-Entry $first.Tag}}})
$tip.SetToolTip($search.Box,'이름 또는 경로 검색  (Ctrl+F · Enter로 첫 항목 실행)')

$opacityIcon=New-Object OpacityGlyph
$slider=New-Object SlimSlider;$slider.Minimum=30;$slider.Maximum=100;$slider.Width=110
$percent=New-Object Windows.Forms.Label;$percent.Size=New-Object Drawing.Size(40,32);$percent.TextAlign='MiddleLeft';$percent.Font=[Theme]::UI(9,$false)
$tip.SetToolTip($slider,'창 투명도  (Ctrl + 마우스 휠로도 조절)');$tip.SetToolTip($opacityIcon,'창 투명도')
$slider.Add_ValueChanged({Set-Opacity $this.Value})
$slider.Add_MouseUp({Save-Items});$slider.Add_MouseWheel({Save-Items})

$themeButton=New-Object RoundButton
$themeButton.Add_Click({$script:theme=if($script:theme -eq 'dark'){'light'}else{'dark'};Apply-Theme;Save-Items})
$addButton=New-Object RoundButton;$addButton.Glyph=[string][char]0xE710;$tip.SetToolTip($addButton,'추가')
$moreButton=New-Object RoundButton;$moreButton.Glyph=[string][char]0xE712;$tip.SetToolTip($moreButton,'설정')

$addMenu=New-Menu
$addFile=$addMenu.Items.Add('파일 추가…');$addFile.Add_Click({$picker=New-Object Windows.Forms.OpenFileDialog;$picker.Multiselect=$true;$picker.DereferenceLinks=$false;if($picker.ShowDialog() -eq 'OK'){foreach($path in $picker.FileNames){Add-Path $path}};$picker.Dispose();Render-Tiles})
$addFolder=$addMenu.Items.Add('폴더 추가…');$addFolder.Add_Click({$picker=New-Object Windows.Forms.FolderBrowserDialog;if($picker.ShowDialog() -eq 'OK'){Add-Path $picker.SelectedPath};$picker.Dispose();Render-Tiles})
[void]$addMenu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
$addCategory=$addMenu.Items.Add('카테고리 추가…');$addCategory.Add_Click({$name=Ask-Text '새 카테고리 이름' '';if($name -and $name -ne '전체' -and $name -notin $script:categories){$script:categories+=$name;Save-Items;Render-Categories};Render-Tiles})
$addButton.Add_Click({$addMenu.Show($addButton,(New-Object Drawing.Point(0,($addButton.Height+4))))})

$moreMenu=New-Menu
$autoItem=New-Object Windows.Forms.ToolStripMenuItem('자동 추가');$autoItem.Checked=$script:autoEnabled
$autoItem.Add_Click({$script:autoEnabled=-not $script:autoEnabled;$this.Checked=$script:autoEnabled;Save-Items;Render-Tiles})
$topItem=New-Object Windows.Forms.ToolStripMenuItem('항상 위')
$topItem.Add_Click({$form.TopMost=-not $form.TopMost;$pin.On=$form.TopMost;$pin.Invalidate()})
$opacityMenu=New-Object Windows.Forms.ToolStripMenuItem('투명도');[AppleMenuRenderer]::Apply($opacityMenu.DropDown)
foreach($level in @(100,90,80,70,60,50)){$option=$opacityMenu.DropDownItems.Add("$level%");$option.Tag=$level;$option.Add_Click({$slider.Value=[int]$this.Tag;Save-Items})}
$sizeMenu=New-Object Windows.Forms.ToolStripMenuItem('창 크기');[AppleMenuRenderer]::Apply($sizeMenu.DropDown)
foreach($choice in @(@('small','작게 (2줄)'),@('medium','보통 (3줄)'),@('large','크게 (4줄)'))){$option=$sizeMenu.DropDownItems.Add($choice[1]);$option.Tag=$choice[0];$option.Add_Click({Set-WindowSize $this.Tag})}
$themeItem=New-Object Windows.Forms.ToolStripMenuItem('다크 모드')
$themeItem.Add_Click({$script:theme=if($script:theme -eq 'dark'){'light'}else{'dark'};Apply-Theme;Save-Items})
[void]$moreMenu.Items.AddRange(@($autoItem,$topItem,$themeItem,$opacityMenu,$sizeMenu))
[void]$moreMenu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
$hideItem=$moreMenu.Items.Add('숨기기');$hideItem.Add_Click({$form.Hide()})
$quitItem=$moreMenu.Items.Add('종료');$quitItem.Add_Click({$form.Close()})
$moreMenu.Add_Opening({$topItem.Checked=$form.TopMost;foreach($option in $opacityMenu.DropDownItems){$option.Checked=([int]$option.Tag -eq $script:opacity)};foreach($option in $sizeMenu.DropDownItems){$option.Checked=($option.Tag -eq $script:size)};$themeItem.Checked=($script:theme -eq 'dark')})
$moreButton.Add_Click({$moreMenu.Show($moreButton,(New-Object Drawing.Point(($moreButton.Width-$moreMenu.Width),($moreButton.Height+4))))})

$header.Controls.AddRange(@($close,$minimize,$pin,$title,$search,$opacityIcon,$slider,$percent,$themeButton,$addButton,$moreButton))
$header.Add_Resize({Layout-Header})

$tabsHost=New-Object Windows.Forms.Panel;$tabsHost.Dock='Top';$tabsHost.Height=44;$tabsHost.AutoScroll=$true
$tabs=New-Object Segmented;$tabs.Location=New-Object Drawing.Point(18,2)
$tabs.Add_SelectedChanged({$script:active=$this.Selected;Render-Tiles})
$tabsHost.Controls.Add($tabs)

$tiles=New-Object Windows.Forms.FlowLayoutPanel;$tiles.Dock='Fill';$tiles.AutoScroll=$true;$tiles.Padding=New-Object Windows.Forms.Padding(12,2,12,2);$tiles.AllowDrop=$true
$tiles.Add_DragEnter({if($_.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)){$_.Effect='Copy'}})
$tiles.Add_DragDrop({foreach($path in $_.Data.GetData([Windows.Forms.DataFormats]::FileDrop)){Add-Path $path};Render-Tiles})
$status=New-Object Windows.Forms.Label;$status.Dock='Bottom';$status.Height=28;$status.Padding=New-Object Windows.Forms.Padding(20,0,0,6);$status.TextAlign='MiddleLeft';$status.Font=[Theme]::UI(8.5,$false)
$form.Controls.AddRange(@($tiles,$tabsHost,$header,$status))

$form.Add_KeyDown({
    if($_.Control -and $_.KeyCode -eq 'F'){$search.Box.Focus();$_.Handled=$true}
    elseif($_.KeyCode -eq 'Escape'){if($search.Box.Text){$search.Box.Clear()}else{$form.Hide()};$_.Handled=$true}
})
$form.Add_MouseWheel({if([Windows.Forms.Control]::ModifierKeys -band [Windows.Forms.Keys]::Control){$slider.Value+=$(if($_.Delta -gt 0){5}else{-5});Save-Items}})
$tiles.Add_MouseWheel({if([Windows.Forms.Control]::ModifierKeys -band [Windows.Forms.Keys]::Control){$slider.Value+=$(if($_.Delta -gt 0){5}else{-5});Save-Items}})
$tiles.Add_HandleCreated({[Ui]::ModernScroll($this,[Theme]::Dark)});$tabsHost.Add_HandleCreated({[Ui]::ModernScroll($this,[Theme]::Dark)})
$form.Add_HandleCreated({$script:roundedByOs=[Ui]::RoundCorners($form.Handle);if($script:roundedByOs -and $script:opacity -ge 100){$form.Region=$null}})

Apply-Theme
$slider.Value=$script:opacity;Set-Opacity $script:opacity
Dock-Launcher;Layout-Header;Render-Categories;Render-Tiles
if($SelfTest){Test-Discovery}
if($Check -or $SelfTest){
    $form.Show();[Windows.Forms.Application]::DoEvents();$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
    $form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save((Join-Path $PSScriptRoot 'preview.png'));$bitmap.Dispose()
    $form.Dispose();Write-Output 'Launcher UI initialization and preview passed';exit 0
}
$script:tray=New-Object Windows.Forms.NotifyIcon;$script:tray.Icon=if($script:appIcon){$script:appIcon}else{[Drawing.SystemIcons]::Application};$script:tray.Text='내 런처';$script:tray.Visible=$true
$script:tray.Add_MouseClick({if($_.Button -eq 'Left'){Toggle-Launcher}})
$script:hotkey=$null;try{$script:hotkey=New-Object Hotkey(6,0x20);$script:hotkey.Add_Pressed({Toggle-Launcher})}catch{}
Update-Status
$trayMenu=New-Menu
$showItem=$trayMenu.Items.Add('런처 열기');$showItem.Add_Click({Show-Launcher})
$exitItem=$trayMenu.Items.Add('종료');$exitItem.Add_Click({$form.Close()});$script:tray.ContextMenuStrip=$trayMenu
$script:timer=New-Object Windows.Forms.Timer;$script:timer.Interval=15000
$script:timer.Add_Tick({try{Dock-Launcher;if($script:autoEnabled){$added=Sync-Candidates @(Find-Candidates);$added+=Sync-Steam;if($added -gt 0){Render-Tiles}}}catch{$status.Text='자동 추가 확인 실패 · 다음 검사에서 재시도합니다'}})
if($script:knownFiles.Count -eq 0){[void](Sync-Candidates @(Find-Candidates) $true)}
if($script:autoEnabled){[void](Sync-Candidates @(Find-Candidates));[void](Sync-Steam);Render-Tiles}
$script:timer.Start()
$form.Add_FormClosed({if($script:hotkey){$script:hotkey.Dispose()};$script:timer.Stop();$script:timer.Dispose();$script:tray.Visible=$false;$script:tray.Dispose();$trayMenu.Dispose()})
[Windows.Forms.Application]::Run($form)
$tip.Dispose();$form.Dispose()
if($script:instance){$script:instance.ReleaseMutex();$script:instance.Dispose()}
