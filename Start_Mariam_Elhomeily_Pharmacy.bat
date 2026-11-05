@echo off
chcp 65001 >nul
title Mariam Elhomeily Pharmacy - صيدلية د. مريم الحميلي

echo =======================================================
echo     🚀 Mariam Elhomeily Pharmacy - تشغيل النظام
echo           صيدلية د. مريم الحميلي
echo =======================================================
echo.

if exist "release\win-unpacked\Mariam Elhomeily Pharmacy.exe" (
    echo [1/1] جاري تشغيل النسخة المستقلة المجهزة للإنتاج...
    start "" "release\win-unpacked\Mariam Elhomeily Pharmacy.exe"
    exit
)

if exist "release\Mariam_Elhomeily_Pharmacy_Portable.exe" (
    echo [1/1] جاري تشغيل النسخة المحمولة (Portable)...
    start "" "release\Mariam_Elhomeily_Pharmacy_Portable.exe"
    exit
)

if exist "release\win-unpacked\Titan Modern POS.exe" (
    echo [1/1] جاري تشغيل النسخة المستقلة المجهزة للإنتاج...
    start "" "release\win-unpacked\Titan Modern POS.exe"
    exit
)

if exist "release\Titan_Modern_POS_Portable.exe" (
    echo [1/1] جاري تشغيل النسخة المحمولة...
    start "" "release\Titan_Modern_POS_Portable.exe"
    exit
)

echo [1/1] جاري تشغيل النظام عبر Electron...
npm start
