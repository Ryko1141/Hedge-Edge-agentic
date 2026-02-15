# ============================================================================
# Hedge Edge License DLL - CMake Build Configuration
# ============================================================================
# This builds the HedgeEdgeLicense.dll for MetaTrader 5 Expert Advisors
# 
# Build Requirements:
#   - Visual Studio 2019 or later with C++ workload
#   - CMake 3.15 or later
#   - Windows SDK
# 
# Build Commands:
#   mkdir build && cd build
#   cmake -G "Visual Studio 17 2022" -A x64 ..
#   cmake --build . --config Release
# ============================================================================

cmake_minimum_required(VERSION 3.15)
project(HedgeEdgeLicense VERSION 1.0.0 LANGUAGES CXX)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Use static runtime library (/MT for Release, /MTd for Debug)
# This is required for MT5 DLL compatibility - no external CRT dependencies
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# ============================================================================
# HedgeEdgeLicense DLL Target
# ============================================================================

add_library(HedgeEdgeLicense SHARED
    HedgeEdgeLicense.cpp
    HedgeEdgeLicense.h
    HedgeEdgeLicense.def
)

# Preprocessor definitions
target_compile_definitions(HedgeEdgeLicense PRIVATE
    HEDGEEDGE_EXPORTS
    WIN32_LEAN_AND_MEAN
    UNICODE
    _UNICODE
    _CRT_SECURE_NO_WARNINGS
)

# Compiler options
target_compile_options(HedgeEdgeLicense PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/W4>          # Warning level 4
    $<$<CXX_COMPILER_ID:MSVC>:/WX->         # Don't treat warnings as errors
    $<$<CXX_COMPILER_ID:MSVC>:/O2>          # Optimize for speed
    $<$<CXX_COMPILER_ID:MSVC>:/EHsc>        # Exception handling
    $<$<CXX_COMPILER_ID:MSVC>:/GL>          # Whole program optimization
)

# Linker options
target_link_options(HedgeEdgeLicense PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/LTCG>        # Link-time code generation
    $<$<CXX_COMPILER_ID:MSVC>:/DEF:${CMAKE_CURRENT_SOURCE_DIR}/HedgeEdgeLicense.def>
)

# Link Windows libraries
target_link_libraries(HedgeEdgeLicense PRIVATE
    winhttp
)

# Set output name
set_target_properties(HedgeEdgeLicense PROPERTIES
    OUTPUT_NAME "HedgeEdgeLicense"
    PREFIX ""
    SUFFIX ".dll"
)

# ============================================================================
# Install Configuration
# ============================================================================

install(TARGETS HedgeEdgeLicense
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

install(FILES HedgeEdgeLicense.h
    DESTINATION include
)

# ============================================================================
# Post-build: Copy DLL to output folder
# ============================================================================

add_custom_command(TARGET HedgeEdgeLicense POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        $<TARGET_FILE:HedgeEdgeLicense>
        ${CMAKE_SOURCE_DIR}/$<TARGET_FILE_NAME:HedgeEdgeLicense>
    COMMENT "Copying HedgeEdgeLicense.dll to source directory"
)

# ============================================================================
# Build Information
# ============================================================================

message(STATUS "")
message(STATUS "=== Hedge Edge License DLL Build Configuration ===")
message(STATUS "  Project Version: ${PROJECT_VERSION}")
message(STATUS "  Build Type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  Compiler: ${CMAKE_CXX_COMPILER_ID}")
message(STATUS "  Output: ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}")
message(STATUS "")
