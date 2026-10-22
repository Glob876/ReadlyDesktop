import book from "./assets/icons/book-open.svg?raw";
import library from "./assets/icons/library-big.svg?raw";
import feather from "./assets/icons/feather.svg?raw";
import settings from "./assets/icons/settings-2.svg?raw";
import arrow from "./assets/icons/arrow-right.svg?raw";
import back from "./assets/icons/arrow-left.svg?raw";
import check from "./assets/icons/check.svg?raw";
import eye from "./assets/icons/eye.svg?raw";
import help from "./assets/icons/circle-question-mark.svg?raw";
import repeat from "./assets/icons/rotate-ccw.svg?raw";
import close from "./assets/icons/x.svg?raw";
import minus from "./assets/icons/minus.svg?raw";
import square from "./assets/icons/square.svg?raw";
import edit from "./assets/icons/file-pen-line.svg?raw";

const icons = { book, library, feather, settings, arrow, back, check, eye, help, repeat, close, minus, square, edit };

export function icon(name: keyof typeof icons): string {
  return icons[name].replace("<svg", '<svg aria-hidden="true" focusable="false"');
}
