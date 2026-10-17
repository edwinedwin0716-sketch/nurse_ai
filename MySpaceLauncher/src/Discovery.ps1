$script:ignored=@();$script:knownFiles=@();$script:autoEnabled=$true;$script:opacity=100;$script:theme='light';$script:size='medium';$script:roundedByOs=$false
$script:protected=Join-Path ([Environment]::GetFolderPath('Desktop')) '학기중 학습 폴더'
function Get-Category($path){
    $name=[IO.Path]::GetFileNameWithoutExtension($path)
    if([IO.Path]::GetExtension($path) -in @('.lnk','.url','.exe') -and $name -match '^(Discord(?: Canary| PTB)?|카카오톡|KakaoTalk|Telegram|텔레그램|WhatsApp|Signal|Slack|Microsoft Teams|Teams|LINE|Skype|Messenger|WeChat)$'){return '메신저'}
    if($name -match 'ChatGPT|Codex|Claude|Gemini|Copilot|Higgsfield'){return 'AI'}
    if($name -match 'League|Riot|라이엇|오버워치|Battle|Teamfight|Steam|게임|Minecraft|Goose|REMATCH|Civilization'){return '게임'}
    if([IO.Path]::GetExtension($path) -notin @('.lnk','.url','.exe','.msi','.bat','.cmd')){return '문서'}
    if($name -match '한글|한셀|한쇼|한워드|한PDF|Excel|Word|PowerPoint|Outlook|Office'){return '업무'}
    return '도구'
}
function Find-Candidates {
    foreach($root in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),(Join-Path $env:USERPROFILE 'Downloads'))){
        if(Test-Path -LiteralPath $root){Get-ChildItem -LiteralPath $root -File -ErrorAction SilentlyContinue | Where-Object {$_.Name -ne 'desktop.ini' -and $_.Name -ne '내 런처.lnk' -and $_.Extension -notin @('.tmp','.part','.crdownload')} | ForEach-Object {$_.FullName}}
    }
    foreach($root in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'))){
        if(Test-Path -LiteralPath $root){Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object {$_.Extension -in @('.lnk','.url') -and $_.BaseName -notmatch 'uninstall|제거|삭제|help|도움말'} | ForEach-Object {$_.FullName}}
    }
}
function Sync-Candidates($paths,$baseline=$false){
    $before=$script:items.Count;$changed=$false
    foreach($path in @($paths|Select-Object -Unique)){
        if($path -in $script:knownFiles){continue}
        $script:knownFiles+=$path;$changed=$true
        if(-not $baseline){Add-Path $path $true}
    }
    if($changed){Save-Items}
    return ($script:items.Count-$before)
}
function Dock-Launcher {
    $area=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $rows=switch($script:size){'small'{2}'large'{4}default{3}}
    $form.Width=[Math]::Min(1100,$area.Width-32);$form.Height=[Math]::Min(138+112*$rows,$area.Height-32)
    $form.Location=New-Object Drawing.Point(($area.Left+[int](($area.Width-$form.Width)/2)),($area.Bottom-$form.Height-14))
    # Windows 11 draws smooth corners itself; translucent (layered) windows still need a region
    if(-not $script:roundedByOs -or $script:opacity -lt 100){
        $round=[Ui]::Round((New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)),20)
        $previous=$form.Region;$form.Region=New-Object Drawing.Region($round);$round.Dispose();if($previous){$previous.Dispose()}
    }
}
function Sync-Steam($libraries=$null){
    $steam=Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue
    if(-not $libraries){
        if(-not $steam.SteamPath){return 0}
        $libraries=@($steam.SteamPath)
        $libraryFile=Join-Path $steam.SteamPath 'steamapps\libraryfolders.vdf'
        if(Test-Path -LiteralPath $libraryFile){
            $text=[IO.File]::ReadAllText($libraryFile)
            foreach($match in [regex]::Matches($text,'"path"\s+"([^"]+)"')){$libraries+=$match.Groups[1].Value.Replace('\\','\')}
        }
    }
    $added=0
    foreach($library in @($libraries|Select-Object -Unique)){
        $apps=Join-Path $library 'steamapps'
        if(-not(Test-Path -LiteralPath $apps)){continue}
        foreach($manifest in Get-ChildItem -LiteralPath $apps -Filter 'appmanifest_*.acf' -File -ErrorAction SilentlyContinue){
            $text=[IO.File]::ReadAllText($manifest.FullName)
            $id=[regex]::Match($text,'"appid"\s+"(\d+)"').Groups[1].Value
            $name=[regex]::Match($text,'"name"\s+"([^"]+)"').Groups[1].Value
            $directory=[regex]::Match($text,'"installdir"\s+"([^"]+)"').Groups[1].Value
            $state=[regex]::Match($text,'"StateFlags"\s+"(\d+)"').Groups[1].Value
            if(-not $id -or -not $directory -or (([int]$state -band 4) -eq 0)){continue}
            if(-not(Test-Path -LiteralPath (Join-Path $apps ('common\'+$directory)))){continue}
            $uri='steam://rungameid/'+$id
            if($uri -in $script:ignored -or @($script:items|Where-Object {$_.path -eq $uri -or $_.name -eq $name}).Count -gt 0){continue}
            $script:items+=[pscustomobject]@{id=[guid]::NewGuid().ToString();name=$name;path=$uri;category='게임'};$added++
        }
    }
    if($added -gt 0){Save-Items};return $added
}
function Test-Discovery {
    $savedStore=$script:store;$savedItems=$script:items;$savedKnown=$script:knownFiles;$savedIgnored=$script:ignored
    $testRoot=Join-Path $env:TEMP ('LauncherTest-'+[guid]::NewGuid());[void][IO.Directory]::CreateDirectory($testRoot)
    $script:store=Join-Path $testRoot 'test.json';$script:items=@();$script:knownFiles=@();$script:ignored=@()
    $first=Join-Path $testRoot 'existing.txt';$second=Join-Path $testRoot 'new.txt';[IO.File]::WriteAllText($first,'test');[IO.File]::WriteAllText($second,'test')
    [void](Sync-Candidates @($first) $true)
    if($script:items.Count -ne 0){throw 'Baseline must not import old files'}
    [void](Sync-Candidates @($first,$second))
    if($script:items.Count -ne 1 -or $script:items[0].category -ne '문서'){throw 'New-file discovery failed'}
    [void](Sync-Candidates @($second));if($script:items.Count -ne 1){throw 'Duplicate prevention failed'}
    $script:items=@();$script:ignored=@($second);$script:knownFiles=@();[void](Sync-Candidates @($second));if($script:items.Count -ne 0){throw 'Ignored item returned'}
    Add-Path $script:protected $true;if($script:items.Count -ne 0){throw 'Protected folder registered'}
    $apps=Join-Path $testRoot 'steamapps';[void][IO.Directory]::CreateDirectory((Join-Path $apps 'common\SampleGame'))
    [IO.File]::WriteAllText((Join-Path $apps 'appmanifest_123456.acf'),'"appid" "123456" "name" "SampleGame" "installdir" "SampleGame" "StateFlags" "4"')
    [void](Sync-Steam @($testRoot));if($script:items.Count -ne 1 -or $script:items[0].path -ne 'steam://rungameid/123456'){throw 'Steam detection failed'}
    [void](Sync-Steam @($testRoot));if($script:items.Count -ne 1){throw 'Steam duplicate prevention failed'}
    $script:store=$savedStore;$script:items=$savedItems;$script:knownFiles=$savedKnown;$script:ignored=$savedIgnored
    Write-Output 'Discovery tests passed: baseline, new file, duplicate, ignored item, protected folder, Steam'
}
