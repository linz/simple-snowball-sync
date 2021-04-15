// const searchH = [true, true, true, true, true, true, true, true, true, false, false, false, false];
// const searchL = [true, true, true, false, false, false, false, false, false, false, false, false, false];

// function doSearch(search) {
//   let highestFalse = search.length;
//   let lowestTrue = -1;

//   let high = search.length - 1;
//   let low = 0;

//   const isTrue = false;

//   while (low <= high) {
//     const mid = (low + high) >>> 1;

//     console.log('Search', { mid, highestFalse, lowestTrue });
//     if (search[mid]) {
//       if (mid > lowestTrue) lowestTrue = mid;
//       low = mid + 1;
//     } else {
//       if (mid < highestFalse) highestFalse = mid;
//       high = mid - 1;
//     }
//   }
// }

// // doSearch(searchH);
// doSearch(searchL);
