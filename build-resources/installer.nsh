; Установщик SoundCloud 2 (2.8.0): тёмные страницы приветствия и финиша с картинкой сбоку (installerSidebar.bmp),
; без вопросов «для кого ставить» и «куда». Если клиент уже стоит, приветствие называет установленную версию и
; предлагает обновить или переустановить поверх. Обновление из клиента (--updated) идёт без страниц: окно с ходом
; установки, потом клиент запускается сам. Файл в UTF-8 с BOM: иначе NSIS прочтёт русские строки в кодировке системы

!define MUI_BGCOLOR "0B0E18"
!define MUI_TEXTCOLOR "FFFFFF"
!define MUI_INSTFILESPAGE_COLORS "DDE3FF 0B0E18"

!ifndef BUILD_UNINSTALLER
  Var scOld
  Var scTitle
  Var scText
  Var scButton
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
        StrCpy $scText "Версия ${VERSION}.$\r$\n$\r$\nМоя волна, которая держит курс, текст песен в такт, стеклянный интерфейс и фон под бит.$\r$\n$\r$\nУстановка займёт несколько секунд."
        StrCpy $scButton "Установить"
      ${elseIf} $scOld == "${VERSION}"
        StrCpy $scTitle "SoundCloud 2 уже установлен"
        StrCpy $scText "У тебя стоит версия ${VERSION}, она последняя.$\r$\n$\r$\nМожно переустановить её поверх. Настройки, аккаунт и история останутся."
        StrCpy $scButton "Переустановить"
      ${else}
        StrCpy $scTitle "Обновление SoundCloud 2"
        StrCpy $scText "Установлена версия $scOld.$\r$\nНовая версия: ${VERSION}.$\r$\n$\r$\nОбновление встанет поверх. Настройки, аккаунт и история останутся."
        StrCpy $scButton "Обновить"
      ${endIf}
    ${else}
      ${if} $scOld == ""
        StrCpy $scTitle "SoundCloud 2"
        StrCpy $scText "Version ${VERSION}.$\r$\n$\r$\nA wave that stays on course, synced lyrics, a glass interface and a background that moves to the beat.$\r$\n$\r$\nSetup takes a few seconds."
        StrCpy $scButton "Install"
      ${elseIf} $scOld == "${VERSION}"
        StrCpy $scTitle "SoundCloud 2 is already installed"
        StrCpy $scText "You have version ${VERSION}, which is the latest.$\r$\n$\r$\nYou can reinstall it over the top. Settings, account and history stay."
        StrCpy $scButton "Reinstall"
      ${else}
        StrCpy $scTitle "Update SoundCloud 2"
        StrCpy $scText "Installed version: $scOld.$\r$\nNew version: ${VERSION}.$\r$\n$\r$\nThe update installs over the top. Settings, account and history stay."
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
