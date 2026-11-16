; Установщик SoundCloud 2 (2.8.1): тёмные страницы в цветах SoundCloud и минимализм установщика Claude. Приветствие и финиш с
; картинкой сбоку (installerSidebar.bmp), на странице установки в шапке крутится спиннер (8 кадров spin/sp0..7.bmp, 8 в
; секунду). Вопросов «для кого ставить» и «куда» нет. Если клиент уже стоит, приветствие называет установленную версию и
; предлагает обновить или переустановить поверх. Обновление из клиента (--updated) идёт без страниц: окно с ходом
; установки, потом клиент запускается сам. Файл в UTF-8 с BOM: иначе NSIS прочтёт русские строки в кодировке системы

!define MUI_BGCOLOR "121212"
!define MUI_TEXTCOLOR "FFFFFF"
!define MUI_INSTFILESPAGE_COLORS "B3B3B3 121212"

!ifndef BUILD_UNINSTALLER
  Var scOld
  Var scTitle
  Var scText
  Var scButton
  Var scTimer
  Var scFrame
!endif

; Установленная версия из записи «Программы и компоненты»: своя для пользователя, потом общая для компьютера
!macro customInit
  StrCpy $scOld ""
  ReadRegStr $scOld HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${if} $scOld == ""
    ReadRegStr $scOld HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${endIf}
!macroend

; Страницы выбора «только мне или всем» нет: клиент ставится текущему пользователю. Установку для всех, сделанную
; раньше, установщик обновляет там же
!macro customInstallMode
  ${if} $hasPerMachineInstallation != "1"
    StrCpy $isForceCurrentInstall "1"
  ${endIf}
!macroend

!macro customWelcomePage
  Function scWelcomePre
    ${if} ${isUpdated}
      Abort
    ${endIf}
    ${if} $LANGUAGE == 1049
      ${if} $scOld == ""
        StrCpy $scTitle "SoundCloud 2"
        StrCpy $scText "Версия ${VERSION}.$\r$\n$\r$\nМоя волна, текст песен в такт и фон под бит."
        StrCpy $scButton "Установить"
      ${elseIf} $scOld == "${VERSION}"
        StrCpy $scTitle "SoundCloud 2 уже стоит"
        StrCpy $scText "Установлена версия ${VERSION}, она последняя.$\r$\n$\r$\nМожно переустановить поверх. Настройки, аккаунт и история останутся."
        StrCpy $scButton "Переустановить"
      ${else}
        StrCpy $scTitle "Доступно обновление"
        StrCpy $scText "Стоит версия $scOld.$\r$\nНовая версия: ${VERSION}.$\r$\n$\r$\nОбновление встанет поверх. Настройки, аккаунт и история останутся."
        StrCpy $scButton "Обновить"
      ${endIf}
    ${else}
      ${if} $scOld == ""
        StrCpy $scTitle "SoundCloud 2"
        StrCpy $scText "Version ${VERSION}.$\r$\n$\r$\nMy Wave, synced lyrics and a background that moves to the beat."
        StrCpy $scButton "Install"
      ${elseIf} $scOld == "${VERSION}"
        StrCpy $scTitle "SoundCloud 2 is installed"
        StrCpy $scText "Version ${VERSION} is installed and up to date.$\r$\n$\r$\nYou can reinstall it over the top. Settings, account and history stay."
        StrCpy $scButton "Reinstall"
      ${else}
        StrCpy $scTitle "Update available"
        StrCpy $scText "Installed: $scOld.$\r$\nNew: ${VERSION}.$\r$\n$\r$\nThe update installs over the top. Settings, account and history stay."
        StrCpy $scButton "Update"
      ${endIf}
    ${endIf}
  FunctionEnd
  ; Кнопка «Далее» называется по делу: «Установить», «Обновить» или «Переустановить»
  Function scWelcomeShow
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$scButton"
  FunctionEnd
  !define MUI_WELCOMEPAGE_TITLE "$scTitle"
  !define MUI_WELCOMEPAGE_TEXT "$scText"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE scWelcomePre
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW scWelcomeShow
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Страница установки: в шапке крутится спиннер. Кадры лежат в установщике и распаковываются во временную папку, таймер
; StdUtils меняет картинку шапки 8 раз в секунду, на выходе со страницы таймер снимается. Если кадр не загрузился,
; шапка остаётся как была, установка идёт как обычно
!macro customPageAfterChangeDir
  Function scSpin
    Push $0
    Push $1
    IntOp $scFrame $scFrame + 1
    IntOp $scFrame $scFrame % 8
    System::Call 'user32::LoadImage(i 0, t "$PLUGINSDIR\sp$scFrame.bmp", i 0, i 0, i 0, i 0x10) i .r1'
    ${if} $1 != 0
      SendMessage $mui.Header.Image 0x172 0 $1 $0
      ${if} $0 != 0
        System::Call 'gdi32::DeleteObject(i r0)'
      ${endIf}
    ${endIf}
    Pop $1
    Pop $0
  FunctionEnd
  Function scInstShow
    InitPluginsDir
    File "/oname=$PLUGINSDIR\sp0.bmp" "${BUILD_RESOURCES_DIR}\spin\sp0.bmp"
    File "/oname=$PLUGINSDIR\sp1.bmp" "${BUILD_RESOURCES_DIR}\spin\sp1.bmp"
    File "/oname=$PLUGINSDIR\sp2.bmp" "${BUILD_RESOURCES_DIR}\spin\sp2.bmp"
    File "/oname=$PLUGINSDIR\sp3.bmp" "${BUILD_RESOURCES_DIR}\spin\sp3.bmp"
    File "/oname=$PLUGINSDIR\sp4.bmp" "${BUILD_RESOURCES_DIR}\spin\sp4.bmp"
    File "/oname=$PLUGINSDIR\sp5.bmp" "${BUILD_RESOURCES_DIR}\spin\sp5.bmp"
    File "/oname=$PLUGINSDIR\sp6.bmp" "${BUILD_RESOURCES_DIR}\spin\sp6.bmp"
    File "/oname=$PLUGINSDIR\sp7.bmp" "${BUILD_RESOURCES_DIR}\spin\sp7.bmp"
    StrCpy $scFrame 0
    ${StdUtils.TimerCreate} $scTimer scSpin 125
  FunctionEnd
  Function scInstLeave
    ${if} $scTimer != ""
      ${StdUtils.TimerDestroy} $0 $scTimer
      StrCpy $scTimer ""
    ${endIf}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW scInstShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE scInstLeave
!macroend

; Финиш: галочка «Запустить» как у стандартной страницы. При обновлении из клиента страницы нет: клиент запускается сам
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
  Function scFinishPre
    ${if} ${isUpdated}
      HideWindow
      Call StartApp
      Quit
    ${endIf}
  FunctionEnd
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE scFinishPre
  !insertmacro MUI_PAGE_FINISH
!macroend

; Ссылки soundcloud-desktop:// клиент регистрирует сам при запуске (app.setAsDefaultProtocolClient, ключ в HKCU).
; При удалении запись убирается, при обновлении остаётся: новая версия лежит по тому же пути и запишет её снова.
; Деинсталлятор пишет ставящаяся версия, поэтому снятие сработает при удалении версий, вышедших после этой
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\soundcloud-desktop"
  ${endIf}
!macroend
