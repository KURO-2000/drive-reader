/* =========================================================
   GOOGLE 설정
========================================================= */

const GOOGLE_CLIENT_ID =
  "380675432822-gkd6ss2s1aj6ca4k9lkv7l4v7vebgb4g.apps.googleusercontent.com";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata"
].join(" ");

const LIBRARY_FOLDER_NAME =
  "Novel Reader Library";

const STATE_FILE_NAME =
  "reader-state.json";


/* =========================================================
   상태
========================================================= */

let tokenClient = null;
let accessToken = "";

let libraryFolderId = "";
let stateFileId = "";

let books = [];

let selectedBook = null;

let txtChapters = [];
let currentTxtChapter = 0;

let epubBook = null;
let epubRendition = null;
let epubObjectUrl = null;

let scrollSaveTimer = null;
let stateSaveTimer = null;

let readerState = {

  settings: {
    theme: "sepia",
    fontSize: 20,
    lineHeight: 1.9
  },

  lastOpenedBookId: null,

  txtProgress: {},

  epubProgress: {}

};


/* =========================================================
   DOM
========================================================= */

const googleLoginBtn =
  document.getElementById("googleLoginBtn");

const loginStatus =
  document.getElementById("loginStatus");

const fileInput =
  document.getElementById("fileInput");

const bookList =
  document.getElementById("bookList");

const bookSearch =
  document.getElementById("bookSearch");

const tocSection =
  document.getElementById("tocSection");

const tocList =
  document.getElementById("tocList");


const emptyScreen =
  document.getElementById("emptyScreen");

const txtReader =
  document.getElementById("txtReader");

const txtScrollArea =
  document.getElementById("txtScrollArea");

const txtContent =
  document.getElementById("txtContent");

const chapterTitle =
  document.getElementById("chapterTitle");

const prevChapterBtn =
  document.getElementById("prevChapterBtn");

const nextChapterBtn =
  document.getElementById("nextChapterBtn");


const epubReader =
  document.getElementById("epubReader");

const epubViewer =
  document.getElementById("epubViewer");

const epubTitle =
  document.getElementById("epubTitle");

const epubPrevBtn =
  document.getElementById("epubPrevBtn");

const epubNextBtn =
  document.getElementById("epubNextBtn");


const settingsPanel =
  document.getElementById("settingsPanel");

const themeSelect =
  document.getElementById("themeSelect");

const fontSizeRange =
  document.getElementById("fontSizeRange");

const lineHeightRange =
  document.getElementById("lineHeightRange");

const fontSizeValue =
  document.getElementById("fontSizeValue");

const lineHeightValue =
  document.getElementById("lineHeightValue");

const settingsBtnMobile =
  document.getElementById("settingsBtnMobile");

const settingsBtnDesktop =
  document.getElementById("settingsBtnDesktop");

const closeSettingsBtn =
  document.getElementById("closeSettingsBtn");

const menuBtn =
  document.getElementById("menuBtn");

const sidebar =
  document.getElementById("sidebar");

const overlay =
  document.getElementById("overlay");

const mobileBookTitle =
  document.getElementById("mobileBookTitle");


/* =========================================================
   초기화
========================================================= */

window.addEventListener("load", () => {

  applySettings();

  waitForGoogle();

});


function waitForGoogle() {

  if (
    window.google &&
    google.accounts &&
    google.accounts.oauth2
  ) {

    initGoogle();

    return;
  }

  setTimeout(
    waitForGoogle,
    300
  );

}


function initGoogle() {

  tokenClient =
    google.accounts.oauth2.initTokenClient({

      client_id:
        GOOGLE_CLIENT_ID,

      scope:
        GOOGLE_SCOPES,

      callback:
        () => {}

    });

}


/* =========================================================
   GOOGLE 로그인
========================================================= */

googleLoginBtn.addEventListener(
  "click",
  connectGoogleDrive
);


async function connectGoogleDrive() {

  try {

    loginStatus.textContent =
      "Google 로그인 중...";

    await authorize();

    loginStatus.textContent =
      "Drive 확인 중...";

    libraryFolderId =
      await ensureLibraryFolder();

    await loadState();

    applySettings();

    await loadBooks();

    loginStatus.textContent =
      "Google Drive 연결됨";

    googleLoginBtn.textContent =
      "✓ Google Drive 연결됨";


    if (
      readerState.lastOpenedBookId
    ) {

      const book =
        books.find(
          b =>
            b.id ===
            readerState.lastOpenedBookId
        );

      if (book) {

        await openBook(book);

      }

    }

  }

  catch (error) {

    console.error(error);

    loginStatus.textContent =
      "Google 연결 실패";

    alert(
      "Google Drive 연결 실패\n\n" +
      error.message
    );

  }

}


function authorize() {

  return new Promise(
    (resolve, reject) => {

      if (!tokenClient) {

        reject(
          new Error(
            "Google 인증 준비가 끝나지 않았습니다."
          )
        );

        return;

      }

      tokenClient.callback =
        response => {

          if (response.error) {

            reject(
              new Error(
                response.error
              )
            );

            return;

          }

          accessToken =
            response.access_token;

          resolve(
            accessToken
          );

        };


      tokenClient.requestAccessToken({

        prompt:
          accessToken
            ? ""
            : "consent"

      });

    }
  );

}


/* =========================================================
   API 공통
========================================================= */

async function apiFetch(
  url,
  options = {}
) {

  if (!accessToken) {

    await authorize();

  }


  let response =
    await fetch(

      url,

      {

        ...options,

        headers: {

          ...(options.headers || {}),

          Authorization:
            `Bearer ${accessToken}`

        }

      }

    );


  if (
    response.status === 401
  ) {

    await authorize();


    response =
      await fetch(

        url,

        {

          ...options,

          headers: {

            ...(options.headers || {}),

            Authorization:
              `Bearer ${accessToken}`

          }

        }

      );

  }


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      text ||
      `HTTP ${response.status}`
    );

  }


  return response;

}


/* =========================================================
   Drive 폴더
========================================================= */

async function ensureLibraryFolder() {

  const query =
    encodeURIComponent(

      `mimeType='application/vnd.google-apps.folder' and name='${LIBRARY_FOLDER_NAME}' and trashed=false`

    );


  const response =
    await apiFetch(

      "https://www.googleapis.com/drive/v3/files" +
      `?q=${query}` +
      "&fields=files(id,name)"

    );


  const data =
    await response.json();


  if (
    data.files &&
    data.files.length > 0
  ) {

    return data.files[0].id;

  }


  const createResponse =
    await apiFetch(

      "https://www.googleapis.com/drive/v3/files",

      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            name:
              LIBRARY_FOLDER_NAME,

            mimeType:
              "application/vnd.google-apps.folder"

          })

      }

    );


  const folder =
    await createResponse.json();


  return folder.id;

}


/* =========================================================
   책 목록
========================================================= */

async function loadBooks() {

  if (!libraryFolderId) {
    return;
  }


  const query =
    encodeURIComponent(

      `'${libraryFolderId}' in parents and trashed=false`

    );


  const response =
    await apiFetch(

      "https://www.googleapis.com/drive/v3/files" +
      `?q=${query}` +
      "&fields=files(id,name,mimeType,size,modifiedTime)" +
      "&orderBy=modifiedTime desc" +
      "&pageSize=500"

    );


  const data =
    await response.json();


  books =
    (data.files || [])
      .filter(
        file =>
          /\.(txt|epub)$/i
            .test(file.name)
      );


  renderBooks();

}


/* =========================================================
   책 목록 표시
========================================================= */

function renderBooks() {

  const keyword =
    bookSearch.value
      .trim()
      .toLowerCase();


  bookList.innerHTML = "";


  const filtered =
    books.filter(

      book =>
        book.name
          .toLowerCase()
          .includes(keyword)

    );


  filtered.forEach(
    book => {

      const button =
        document.createElement(
          "button"
        );


      button.className =
        "book-item";


      if (
        selectedBook &&
        selectedBook.id ===
        book.id
      ) {

        button.classList.add(
          "active"
        );

      }


      button.textContent =
        book.name;


      button.addEventListener(
        "click",
        () => openBook(book)
      );


      bookList.appendChild(
        button
      );

    }
  );

}


bookSearch.addEventListener(
  "input",
  renderBooks
);


/* =========================================================
   업로드
========================================================= */

fileInput.addEventListener(
  "change",
  handleFileUpload
);


async function handleFileUpload(event) {

  const files =
    Array.from(
      event.target.files
    );


  if (!files.length) {
    return;
  }


  if (!accessToken) {

    alert(
      "먼저 Google Drive를 연결하세요."
    );

    event.target.value = "";

    return;

  }


  for (
    const file of files
  ) {

    if (
      !/\.(txt|epub)$/i
        .test(file.name)
    ) {

      continue;

    }


    loginStatus.textContent =
      `${file.name} 업로드 중...`;


    await uploadBook(file);

  }


  event.target.value = "";


  await loadBooks();


  loginStatus.textContent =
    "업로드 완료";

}


/* =========================================================
   multipart 업로드
========================================================= */

async function uploadBook(file) {

  const metadata = {

    name:
      file.name,

    parents: [
      libraryFolderId
    ]

  };


  return multipartUpload(
    metadata,
    file
  );

}


async function multipartUpload(
  metadata,
  blob,
  fileId = null
) {

  const boundary =
    "reader_" +
    Math.random()
      .toString(36)
      .substring(2);


  const body =
    new Blob(

      [

        `--${boundary}\r\n`,

        "Content-Type: application/json; charset=UTF-8\r\n\r\n",

        JSON.stringify(metadata),

        `\r\n--${boundary}\r\n`,

        `Content-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,

        blob,

        `\r\n--${boundary}--`

      ],

      {

        type:
          `multipart/related; boundary=${boundary}`

      }

    );


  const url =
    fileId

      ?

      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`

      :

      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";


  const response =
    await apiFetch(

      url,

      {

        method:
          fileId
            ? "PATCH"
            : "POST",

        headers: {

          "Content-Type":
            `multipart/related; boundary=${boundary}`

        },

        body

      }

    );


  return response.json();

}


/* =========================================================
   책 열기
========================================================= */

async function openBook(book) {

  selectedBook =
    book;


  renderBooks();


  mobileBookTitle.textContent =
    book.name;


  readerState.lastOpenedBookId =
    book.id;


  scheduleStateSave();


  emptyScreen.classList.add(
    "hidden"
  );


  txtReader.classList.add(
    "hidden"
  );


  epubReader.classList.add(
    "hidden"
  );


  if (
    book.name
      .toLowerCase()
      .endsWith(".txt")
  ) {

    await openTxtBook(book);

  }

  else {

    await openEpubBook(book);

  }


  closeMobileMenu();

}


/* =========================================================
   Drive 파일 다운로드
========================================================= */

async function downloadDriveFile(
  fileId
) {

  const response =
    await apiFetch(

      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`

    );


  return response;

}


/* =========================================================
   TXT 열기
========================================================= */

async function openTxtBook(book) {

  destroyEpub();


  const response =
    await downloadDriveFile(
      book.id
    );


  const text =
    await response.text();


  txtChapters =
    splitTxtIntoChapters(
      text
    );


  const progress =
    readerState
      .txtProgress[
        book.id
      ] || {};


  currentTxtChapter =
    Math.min(

      progress.chapterIndex || 0,

      txtChapters.length - 1

    );


  renderTxtChapter(
    progress.scrollRatio || 0
  );


  renderTxtToc();


  txtReader.classList.remove(
    "hidden"
  );


  epubReader.classList.add(
    "hidden"
  );

}


/* =========================================================
   TXT 자동 장 분리
========================================================= */

function splitTxtIntoChapters(
  text
) {

  const normalized =
    text.replace(
      /\r\n/g,
      "\n"
    );


  const lines =
    normalized.split("\n");


  const chapterRegex =
    /^\s*(?:(?:第\s*[0-9０-９零〇一二三四五六七八九十百千万萬兩两]+\s*[章节章節卷巻话話回篇部])|(?:Chapter\s+\d+)|(?:CHAPTER\s+\d+)|序章|序言|楔子|前言|终章|終章|后记|後記|番外(?:篇)?)(?:[\s：:\-—　].*)?\s*$/i;


  const positions = [];


  lines.forEach(
    (line, index) => {

      if (
        chapterRegex.test(
          line.trim()
        )
      ) {

        positions.push(
          index
        );

      }

    }
  );


  if (
    positions.length === 0
  ) {

    return [

      {

        title: "全文",

        content:
          normalized

      }

    ];

  }


  const chapters = [];


  if (
    positions[0] > 0
  ) {

    const intro =
      lines
        .slice(
          0,
          positions[0]
        )
        .join("\n")
        .trim();


    if (intro) {

      chapters.push({

        title: "前文",

        content: intro

      });

    }

  }


  positions.forEach(
    (start, index) => {

      const end =
        index + 1 <
        positions.length

          ?

          positions[index + 1]

          :

          lines.length;


      const title =
        lines[start]
          .trim();


      const content =
        lines
          .slice(
            start,
            end
          )
          .join("\n")
          .trim();


      chapters.push({

        title,

        content

      });

    }
  );


  return chapters;

}


/* =========================================================
   TXT 표시
========================================================= */

function renderTxtChapter(
  restoreRatio = 0
) {

  const chapter =
    txtChapters[
      currentTxtChapter
    ];


  if (!chapter) {
    return;
  }


  chapterTitle.textContent =
    chapter.title;


  txtContent.textContent =
    chapter.content;


  prevChapterBtn.disabled =
    currentTxtChapter <= 0;


  nextChapterBtn.disabled =
    currentTxtChapter >=
    txtChapters.length - 1;


  requestAnimationFrame(
    () => {

      requestAnimationFrame(
        () => {

          const max =
            txtScrollArea.scrollHeight -
            txtScrollArea.clientHeight;


          txtScrollArea.scrollTop =
            max > 0
              ? max * restoreRatio
              : 0;

        }
      );

    }
  );


  renderTxtToc();

}


/* =========================================================
   TXT 목차
========================================================= */

function renderTxtToc() {

  tocSection.classList.remove(
    "hidden"
  );


  tocList.innerHTML = "";


  txtChapters.forEach(
    (chapter, index) => {

      const button =
        document.createElement(
          "button"
        );


      button.className =
        "toc-item";


      if (
        index ===
        currentTxtChapter
      ) {

        button.classList.add(
          "active"
        );

      }


      button.textContent =
        chapter.title;


      button.addEventListener(
        "click",
        () => {

          moveTxtChapter(
            index
          );

        }
      );


      tocList.appendChild(
        button
      );

    }
  );

}


/* =========================================================
   TXT 장 이동
========================================================= */

async function moveTxtChapter(
  index
) {

  if (
    index < 0 ||
    index >=
      txtChapters.length
  ) {

    return;

  }


  currentTxtChapter =
    index;


  readerState
    .txtProgress[
      selectedBook.id
    ] = {

      chapterIndex:
        currentTxtChapter,

      scrollRatio: 0

    };


  renderTxtChapter(0);


  scheduleStateSave();

}


prevChapterBtn.addEventListener(
  "click",
  () => {

    moveTxtChapter(
      currentTxtChapter - 1
    );

  }
);


nextChapterBtn.addEventListener(
  "click",
  () => {

    moveTxtChapter(
      currentTxtChapter + 1
    );

  }
);


/* =========================================================
   TXT 스크롤 저장
========================================================= */

txtScrollArea.addEventListener(
  "scroll",
  () => {

    if (
      !selectedBook ||
      !selectedBook.name
        .toLowerCase()
        .endsWith(".txt")
    ) {

      return;

    }


    clearTimeout(
      scrollSaveTimer
    );


    scrollSaveTimer =
      setTimeout(
        saveTxtScroll,
        800
      );

  }
);


function saveTxtScroll() {

  const max =
    txtScrollArea.scrollHeight -
    txtScrollArea.clientHeight;


  const ratio =
    max > 0

      ?

      txtScrollArea.scrollTop /
      max

      :

      0;


  readerState
    .txtProgress[
      selectedBook.id
    ] = {

      chapterIndex:
        currentTxtChapter,

      scrollRatio:
        ratio

    };


  scheduleStateSave();

}


/* =========================================================
   EPUB
========================================================= */

async function openEpubBook(
  book
) {

  destroyEpub();


  const response =
    await downloadDriveFile(
      book.id
    );


  const blob =
    await response.blob();


  epubObjectUrl =
    URL.createObjectURL(
      blob
    );


  epubBook =
    ePub(
      epubObjectUrl
    );


  epubRendition =
    epubBook.renderTo(

      "epubViewer",

      {

        width: "100%",

        height: "100%",

        flow:
          "scrolled-doc"

      }

    );


  const progress =
    readerState
      .epubProgress[
        book.id
      ] || {};


  await epubRendition.display(
    progress.cfi || undefined
  );


  epubTitle.textContent =
    book.name;


  epubRendition.on(

    "relocated",

    location => {

      const cfi =
        location?.start?.cfi;


      if (!cfi) {
        return;
      }


      readerState
        .epubProgress[
          book.id
        ] = {

          cfi

        };


      scheduleStateSave();

    }

  );


  const navigation =
    await epubBook.loaded.navigation;


  renderEpubToc(
    navigation.toc || []
  );


  applyEpubSettings();


  txtReader.classList.add(
    "hidden"
  );


  epubReader.classList.remove(
    "hidden"
  );

}


function renderEpubToc(
  toc
) {

  tocSection.classList.remove(
    "hidden"
  );


  tocList.innerHTML = "";


  function addItems(
    items,
    depth = 0
  ) {

    items.forEach(
      item => {

        const button =
          document.createElement(
            "button"
          );


        button.className =
          "toc-item";


        button.style.paddingLeft =
          `${10 + depth * 14}px`;


        button.textContent =
          item.label;


        button.addEventListener(
          "click",
          () => {

            epubRendition
              ?.display(
                item.href
              );

            closeMobileMenu();

          }
        );


        tocList.appendChild(
          button
        );


        if (
          item.subitems &&
          item.subitems.length
        ) {

          addItems(
            item.subitems,
            depth + 1
          );

        }

      }
    );

  }


  addItems(toc);

}


epubPrevBtn.addEventListener(
  "click",
  () => {

    epubRendition
      ?.prev();

  }
);


epubNextBtn.addEventListener(
  "click",
  () => {

    epubRendition
      ?.next();

  }
);


function destroyEpub() {

  if (epubRendition) {

    try {

      epubRendition.destroy();

    }

    catch (e) {

      console.log(e);

    }

  }


  if (epubBook) {

    try {

      epubBook.destroy();

    }

    catch (e) {

      console.log(e);

    }

  }


  if (epubObjectUrl) {

    URL.revokeObjectURL(
      epubObjectUrl
    );

  }


  epubViewer.innerHTML = "";


  epubRendition = null;
  epubBook = null;
  epubObjectUrl = null;

}


/* =========================================================
   Reader 설정
========================================================= */

themeSelect.addEventListener(
  "change",
  () => {

    readerState.settings.theme =
      themeSelect.value;

    applySettings();

    scheduleStateSave();

  }
);


fontSizeRange.addEventListener(
  "input",
  () => {

    readerState.settings.fontSize =
      Number(
        fontSizeRange.value
      );

    applySettings();

    scheduleStateSave();

  }
);


lineHeightRange.addEventListener(
  "input",
  () => {

    readerState.settings.lineHeight =
      Number(
        lineHeightRange.value
      );

    applySettings();

    scheduleStateSave();

  }
);


function applySettings() {

  const settings =
    readerState.settings;


  document.body.classList.remove(

    "theme-light",
    "theme-sepia",
    "theme-dark"

  );


  document.body.classList.add(
    `theme-${settings.theme}`
  );


  themeSelect.value =
    settings.theme;


  fontSizeRange.value =
    settings.fontSize;


  lineHeightRange.value =
    settings.lineHeight;


  fontSizeValue.textContent =
    `${settings.fontSize}px`;


  lineHeightValue.textContent =
    settings.lineHeight;


  txtContent.style.fontSize =
    `${settings.fontSize}px`;


  txtContent.style.lineHeight =
    settings.lineHeight;


  applyEpubSettings();

}


function applyEpubSettings() {

  if (!epubRendition) {
    return;
  }


  const settings =
    readerState.settings;


  let background;
  let color;


  if (
    settings.theme ===
    "dark"
  ) {

    background =
      "#151515";

    color =
      "#ededed";

  }

  else if (
    settings.theme ===
    "light"
  ) {

    background =
      "#ffffff";

    color =
      "#222222";

  }

  else {

    background =
      "#f6ecd8";

    color =
      "#3f3125";

  }


  epubRendition.themes.default({

    body: {

      "background":
        `${background} !important`,

      "color":
        `${color} !important`,

      "font-size":
        `${settings.fontSize}px !important`,

      "line-height":
        `${settings.lineHeight} !important`,

      "padding":
        "20px !important"

    }

  });

}


/* =========================================================
   상태 저장
========================================================= */

function scheduleStateSave() {

  clearTimeout(
    stateSaveTimer
  );


  stateSaveTimer =
    setTimeout(
      saveState,
      1000
    );

}


/* =========================================================
   appData 상태 읽기
========================================================= */

async function loadState() {

  try {

    const query =
      encodeURIComponent(

        `name='${STATE_FILE_NAME}' and trashed=false`

      );


    const response =
      await apiFetch(

        "https://www.googleapis.com/drive/v3/files" +
        "?spaces=appDataFolder" +
        `&q=${query}` +
        "&fields=files(id,name)"

      );


    const data =
      await response.json();


    if (
      !data.files ||
      data.files.length === 0
    ) {

      stateFileId = "";

      return;

    }


    stateFileId =
      data.files[0].id;


    const stateResponse =
      await apiFetch(

        `https://www.googleapis.com/drive/v3/files/${stateFileId}?alt=media`

      );


    const text =
      await stateResponse.text();


    const parsed =
      JSON.parse(text);


    readerState = {

      settings: {

        theme:
          parsed.settings
            ?.theme ||
          "sepia",

        fontSize:
          parsed.settings
            ?.fontSize ||
          20,

        lineHeight:
          parsed.settings
            ?.lineHeight ||
          1.9

      },

      lastOpenedBookId:
        parsed.lastOpenedBookId ||
        null,

      txtProgress:
        parsed.txtProgress ||
        {},

      epubProgress:
        parsed.epubProgress ||
        {}

    };

  }

  catch (error) {

    console.error(
      "상태 불러오기 실패",
      error
    );

  }

}


/* =========================================================
   appData 상태 저장
========================================================= */

async function saveState() {

  if (!accessToken) {
    return;
  }


  try {

    const blob =
      new Blob(

        [

          JSON.stringify(
            readerState,
            null,
            2
          )

        ],

        {

          type:
            "application/json"

        }

      );


    const metadata =
      stateFileId

        ?

        {

          name:
            STATE_FILE_NAME

        }

        :

        {

          name:
            STATE_FILE_NAME,

          parents: [
            "appDataFolder"
          ]

        };


    const result =
      await multipartUpload(

        metadata,

        blob,

        stateFileId || null

      );


    if (!stateFileId) {

      stateFileId =
        result.id;

    }

  }

  catch (error) {

    console.error(
      "상태 저장 실패",
      error
    );

  }

}


/* =========================================================
   설정창
========================================================= */

settingsBtnMobile.addEventListener(
  "click",
  openSettings
);


settingsBtnDesktop.addEventListener(
  "click",
  openSettings
);


closeSettingsBtn.addEventListener(
  "click",
  closeSettings
);


function openSettings() {

  settingsPanel.classList.remove(
    "hidden"
  );

}


function closeSettings() {

  settingsPanel.classList.add(
    "hidden"
  );

}


/* =========================================================
   모바일 메뉴
========================================================= */

menuBtn.addEventListener(
  "click",
  () => {

    sidebar.classList.toggle(
      "open"
    );


    if (
      sidebar.classList
        .contains("open")
    ) {

      overlay.classList.remove(
        "hidden"
      );

    }

    else {

      overlay.classList.add(
        "hidden"
      );

    }

  }
);


overlay.addEventListener(
  "click",
  closeMobileMenu
);


function closeMobileMenu() {

  sidebar.classList.remove(
    "open"
  );


  overlay.classList.add(
    "hidden"
  );

}


/* =========================================================
   페이지 떠날 때 위치 저장
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      selectedBook &&
      selectedBook.name
        .toLowerCase()
        .endsWith(".txt")
    ) {

      saveTxtScroll();

    }

  }
);
